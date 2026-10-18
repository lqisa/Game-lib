#!/usr/bin/env node
/**
 * Builds the server payload that ships in resources/server next to the
 * packaged app (see extraResources in electron-builder.yml).
 *
 * This is the electron-builder port of the old quasar.config.ts hooks
 * (extendElectronPackageJson + packager.afterCopyExtraResources); the
 * behaviour is intentionally identical:
 *
 *   1. install the backend's runtime dependencies into a throwaway workspace
 *      (.packaging/install), pinned to the exact versions used in development;
 *   2. copy server/ plus that node_modules into .packaging/server - dropping
 *      the pnpm bookkeeping and every file the runtime never loads (see
 *      shouldSkipNodeModulesEntry), dereferencing symlinks so the folder
 *      survives being zipped and copied to another machine;
 *   3. drop the dev-only backend files and obfuscate the remaining .js files.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as obfuscatorPackage from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const installDir = path.join(rootDir, '.packaging', 'install');
const outputDir = path.join(rootDir, '.packaging', 'server');

// The packaged app runs the Express backend from resources/server, and that
// backend imports these at runtime. They must be installed inside the package:
// otherwise Node's module resolution walks up from resources/server and only
// finds the deps as long as the build happens to sit inside the dev project
// folder - a copied/distributed build would not start.
const SERVER_RUNTIME_DEPS = [
  '@tensorflow/tfjs',
  '@tensorflow/tfjs-backend-wasm',
  'axios',
  'cheerio',
  'express',
  'https-proxy-agent',
  'knex',
  'nsfwjs',
  'sharp',
  'sqlite3',
];

// Dev-only backend files: the test suite, maintenance scripts and the dev
// entry never run inside the package.
const SKIPPED_SERVER_ENTRIES = new Set(['__tests__', 'scripts', 'dev.js']);

// The install directory is its own pnpm workspace root, so the parent
// project's pnpm state cannot interfere with the payload install.
const PNPM_WORKSPACE_YAML = `# Settings for the throwaway install of the packaged backend.
#
# hoisted layout: the payload is shipped as plain files; pnpm's default
# isolated node_modules links every package with symlinks into node_modules/.pnpm,
# which breaks as soon as the build output is copied/zipped, so use npm-style flat.
nodeLinker: hoisted

# sharp and sqlite3 ship prebuilt native binaries that are downloaded/verified
# by their install scripts. pnpm blocks install scripts unless allowed, and
# (since pnpm 12) fails the install when it finds a blocked one.
allowBuilds:
  core-js: true # transitive dep of @tensorflow/tfjs
  sharp: true
  sqlite3: true
`;

/**
 * Resolves the runtime deps to the exact versions installed in this project, so the
 * packaged app runs the same code that was tested in development. The list above only
 * names them; the versions stay sourced from the root package.json / node_modules.
 */
function resolveServerRuntimeDeps() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  const resolved = {};
  for (const name of SERVER_RUNTIME_DEPS) {
    const range = rootPkg.dependencies?.[name];
    if (range === undefined) {
      throw new Error(
        `[package] "${name}" must stay in the root package.json dependencies - the packaged app ships it.`,
      );
    }

    const installedPkgPath = path.join(rootDir, 'node_modules', name, 'package.json');
    resolved[name] = fs.existsSync(installedPkgPath)
      ? JSON.parse(fs.readFileSync(installedPkgPath, 'utf8')).version
      : range;
  }

  return resolved;
}

/**
 * Decides whether an entry of the runtime node_modules can be dropped from the package.
 * `rel` is a posix path relative to node_modules (a directory is passed with its children
 * still inside, so returning true here skips the whole subtree).
 *
 * The rules only cover packages whose runtime entry points are known: everything not
 * matched is shipped untouched. The big wins are files that module loaders never touch
 * at runtime - source maps, alternate module-format bundles, model weights for models
 * the app never loads, and native-build leftovers.
 */
function shouldSkipNodeModulesEntry(rel) {
  // Source maps and TypeScript build info are debugging artifacts - Node never loads them.
  if (rel.endsWith('.map') || rel.endsWith('.tsbuildinfo')) return true;
  // pnpm bookkeeping of the temporary install - the flat runtime tree does not need it.
  if (rel === '.pnpm' || rel.startsWith('.pnpm/')) return true;

  const segments = rel.split('/');
  const [scopeOrName, scopedName] = segments;
  const packageName =
    scopeOrName?.startsWith('@') && scopedName ? `${scopeOrName}/${scopedName}` : (scopeOrName ?? '');

  // Type packages are compile-time only, and node-gyp/tar exist to compile sqlite3's
  // binding - the already-built .node file is all the runtime needs.
  if (packageName === '@types' || packageName.startsWith('@types/')) return true;
  if (packageName === 'node-gyp' || packageName === 'tar') return true;

  const inner = segments.slice(packageName.split('/').length).join('/');

  if (packageName.startsWith('@tensorflow/')) {
    // Every package ships one bundle per target environment (browser, ES2017, ESM,
    // miniprogram, plus nested chunk folders). Node only ever resolves the package
    // "main" - dist/<name>.node.js - and those bundles inline their internals (no
    // relative requires), while the wasm backend loads its .wasm files (kept below)
    // from dist/ by filename. Everything else under dist/ is dead weight.
    if (/^(?:src|tools|\.rollup\.cache|wasm-out)(?:\/|$)/.test(inner)) return true;
    if (/^dist\/(?:miniprogram|tools)(?:\/|$)/.test(inner)) return true;
    if (
      inner === 'run_tools_tests.ts' ||
      inner === 'tsconfig.test.json' ||
      inner === 'rollup.config.mjs'
    ) {
      return true;
    }
    if (/\.html$/.test(inner) || /\.externs\.js$/.test(inner) || /_test\.js$/.test(inner)) {
      return true;
    }
    if (inner.startsWith('dist/') && inner.endsWith('.js')) {
      const rest = inner.slice('dist/'.length);
      if (!rest.includes('/')) {
        if (rest.endsWith('.node.js')) return false;
        if (rest === 'index.js' || rest === 'version.js' || rest.endsWith('.worker.js')) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  // nsfwjs bundles three models; the classifier always loads the default MobileNetV2
  // (nsfwjs.load() without an argument). The other two are ~36MB of unused weights.
  if (packageName === 'nsfwjs') {
    return (
      /^dist\/browser(?:\/|$)/.test(inner) ||
      /^dist\/models\/(?:inception_v3|mobilenet_v2_mid)(?:\/|$)/.test(inner)
    );
  }

  // sqlite3 keeps the C sources and a source tarball for rebuilding the binding:
  // build/ (the compiled .node) and lib/ are the parts used at runtime.
  if (packageName === 'sqlite3') {
    return /^deps(?:\/|$)/.test(inner) || /^src(?:\/|$)/.test(inner);
  }

  return false;
}

/**
 * Obfuscates the backend source that ships in resources/server. Deliberately moderate:
 * identifiers and string literals are transformed, but nothing that changes control flow
 * (see the disabled options) - this code runs unattended on users' machines, so runtime
 * behaviour and startup cost win over maximum obfuscation. A file the parser cannot read
 * is shipped as-is and reported, instead of failing the whole build.
 */
const SERVER_OBFUSCATOR_OPTIONS = {
  compact: true,
  simplify: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: [],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersType: 'variable',
  splitStrings: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,
  disableConsoleOutput: false,
  unicodeEscapeSequence: false,
  numbersToExpressions: false,
  transformObjectKeys: false,
  sourceMap: false,
  log: false,
  seed: 20261017,
  target: 'node',
  sourceType: 'module',
  ignoreRequireImports: true,
};

/**
 * javascript-obfuscator is CommonJS (a webpack bundle); instead of guessing the
 * interop shape, probe the namespace and its `default` chain for obfuscate().
 */
function findObfuscateFunction() {
  let candidate = obfuscatorPackage;
  for (let depth = 0; depth < 3; depth += 1) {
    const fn = candidate?.obfuscate;
    if (typeof fn === 'function') return fn;
    candidate = candidate?.default;
  }
  throw new Error('[package] javascript-obfuscator: no obfuscate() export found');
}

function prepareInstallDir() {
  fs.rmSync(installDir, { recursive: true, force: true });
  fs.mkdirSync(installDir, { recursive: true });

  const manifest = {
    name: 'game-lib-server-payload',
    version: '1.0.0',
    private: true,
    type: 'module',
    dependencies: resolveServerRuntimeDeps(),
  };
  fs.writeFileSync(path.join(installDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(installDir, 'pnpm-workspace.yaml'), PNPM_WORKSPACE_YAML);

  // Same registry/mirror configuration as the repo root.
  const npmrc = path.join(rootDir, '.npmrc');
  if (fs.existsSync(npmrc)) {
    fs.copyFileSync(npmrc, path.join(installDir, '.npmrc'));
  }

  console.log(' * [package] installing backend runtime dependencies...');
  execSync('pnpm install --prod', { cwd: installDir, stdio: 'inherit' });
}

function copyServerPayload() {
  fs.rmSync(outputDir, { recursive: true, force: true });

  const serverSource = path.join(rootDir, 'server');
  fs.cpSync(serverSource, outputDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(serverSource, src);
      return rel === '' || !SKIPPED_SERVER_ENTRIES.has(rel);
    },
  });

  const nodeModulesSource = path.join(installDir, 'node_modules');
  if (!fs.existsSync(nodeModulesSource)) {
    throw new Error(
      `[package] no packaged dependencies found at ${nodeModulesSource}. ` +
        'Check the pnpm install output above.',
    );
  }
  fs.cpSync(nodeModulesSource, path.join(outputDir, 'node_modules'), {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = path.relative(nodeModulesSource, src).split(path.sep).join('/');
      return rel === '' || !shouldSkipNodeModulesEntry(rel);
    },
  });

  // type: module - Node then treats the shipped backend as ESM deterministically
  // instead of relying on syntax detection.
  fs.copyFileSync(path.join(installDir, 'package.json'), path.join(outputDir, 'package.json'));
}

/**
 * Drops the dev-only files and obfuscates every remaining .js file in place.
 * node_modules is left alone - obfuscating dependency code buys nothing and
 * risks breaking packages that introspect their own functions.
 */
function obfuscateServerPayload() {
  const obfuscate = findObfuscateFunction();
  const nodeModulesDir = path.join(outputDir, 'node_modules');
  const failures = [];
  let obfuscated = 0;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== nodeModulesDir) walk(full);
      } else if (entry.name.endsWith('.js')) {
        try {
          const result = obfuscate(fs.readFileSync(full, 'utf8'), SERVER_OBFUSCATOR_OPTIONS);
          fs.writeFileSync(full, result.getObfuscatedCode());
          obfuscated += 1;
        } catch (err) {
          failures.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  };
  walk(outputDir);

  const detail = failures.length > 0 ? ` (left unobfuscated: ${failures.join('; ')})` : '';
  console.log(` * [package] obfuscated ${obfuscated} backend files${detail}`);
}

prepareInstallDir();
copyServerPayload();
obfuscateServerPayload();
console.log(` * [package] server payload ready at ${path.relative(rootDir, outputDir)}`);
