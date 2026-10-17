// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';
import fs from 'node:fs';
import path from 'node:path';
import * as obfuscatorPackage from 'javascript-obfuscator';
import type { ObfuscatorOptions } from 'javascript-obfuscator';

// The packaged app runs the Express backend from resources/server (packager's
// extraResource below), and that backend imports these at runtime. They must be
// installed inside the package: otherwise Node's module resolution walks up from
// resources/server and only finds the deps as long as the build happens to sit
// inside the dev project folder - a copied/distributed build would not start.
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

/**
 * Resolves the runtime deps to the exact versions installed in this project, so the
 * packaged app runs the same code that was tested in development. The list above only
 * names them; the versions stay sourced from the root package.json / node_modules.
 */
function resolveServerRuntimeDeps(): Record<string, string> {
  const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  const resolved: Record<string, string> = {};
  for (const name of SERVER_RUNTIME_DEPS) {
    const range = rootPkg.dependencies?.[name];
    if (range === undefined) {
      throw new Error(
        `[electron] "${name}" must stay in the root package.json dependencies - the packaged app ships it.`,
      );
    }

    const installedPkgPath = path.resolve(__dirname, 'node_modules', name, 'package.json');
    resolved[name] = fs.existsSync(installedPkgPath)
      ? (JSON.parse(fs.readFileSync(installedPkgPath, 'utf8')) as { version: string }).version
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
function shouldSkipNodeModulesEntry(rel: string): boolean {
  // Source maps and TypeScript build info are debugging artifacts - Node never loads them.
  if (rel.endsWith('.map') || rel.endsWith('.tsbuildinfo')) return true;
  // pnpm bookkeeping of the temporary install - the flat runtime tree does not need it.
  if (rel === '.pnpm' || rel.startsWith('.pnpm/')) return true;

  const segments = rel.split('/');
  const [scopeOrName, scopedName] = segments;
  const packageName =
    scopeOrName?.startsWith('@') && scopedName
      ? `${scopeOrName}/${scopedName}`
      : (scopeOrName ?? '');

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
const SERVER_OBFUSCATOR_OPTIONS: ObfuscatorOptions = {
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

type ObfuscateFunction = (
  source: string,
  options?: ObfuscatorOptions,
) => {
  getObfuscatedCode(): string;
};

/**
 * javascript-obfuscator is CommonJS (a webpack bundle), and the Quasar config loader
 * decides on its own how to expose CJS imports to this file - in the first build the
 * function was not reachable as a plain namespace property. Instead of guessing the
 * interop shape, probe the namespace and its `default` chain for obfuscate().
 */
function findObfuscateFunction(): ObfuscateFunction {
  let candidate: unknown = obfuscatorPackage;
  for (let depth = 0; depth < 3; depth += 1) {
    const fn = (candidate as { obfuscate?: ObfuscateFunction } | undefined)?.obfuscate;
    if (typeof fn === 'function') return fn;
    candidate = (candidate as { default?: unknown } | undefined)?.default;
  }
  throw new Error('[electron] javascript-obfuscator: no obfuscate() export found');
}

/**
 * Prepares the copied backend in resources/server: the dev-only files (test suite,
 * maintenance scripts, dev entry) are dropped, every remaining .js file is obfuscated
 * in place. node_modules is left alone - obfuscating dependency code buys nothing and
 * risks breaking packages that introspect their own functions.
 */
function preparePackagedServer(serverDir: string) {
  for (const name of ['__tests__', 'scripts', 'dev.js']) {
    fs.rmSync(path.join(serverDir, name), { recursive: true, force: true });
  }

  const obfuscate = findObfuscateFunction();
  const nodeModulesDir = path.join(serverDir, 'node_modules');
  const failures: string[] = [];
  let obfuscated = 0;

  const walk = (dir: string) => {
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
          failures.push(`${entry.name}: ${(err as Error).message}`);
        }
      }
    }
  };
  walk(serverDir);

  const detail = failures.length > 0 ? ` (left unobfuscated: ${failures.join('; ')})` : '';
  console.log(` * [electron] obfuscated ${obfuscated} backend files${detail}`);
}

export default defineConfig((/* ctx */) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['lazyImg'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.css'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v7',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        // browser: 'baseline-widely-available',
        // node: 'node22'
      },

      typescript: {
        strict: true,
        vueShim: true,
        // extendTsConfig (tsConfig) {}
      },

      // https://v2.quasar.dev/quasar-cli-vite/page-routing-with-vue-router#filename-based-routing
      // filenameBasedRouting: true,

      vueRouterMode: 'hash', // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,

      // publicPath: '/',
      // define: {},
      // defineEnv: {}
      // ignorePublicFolder: true,
      // minify: false,
      // distDir

      // extendViteConf (viteConf) {},
      // viteVuePluginOptions: {},

      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      open: false,
      port: parseInt(process.env.VITE_FRONTEND_PORT || '9000', 10),
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${process.env.VITE_API_PORT || 19700}`,
          changeOrigin: true,
        },
        '/covers': {
          target: `http://127.0.0.1:${process.env.VITE_API_PORT || 19700}`,
          changeOrigin: true,
        },
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},

      // iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      // `Notify` must be listed here or `$q.notify` is undefined and every call throws -
      // the app has 18 notify() call sites (task finished, scrape errors, region
      // warnings), and without this plugin all of them failed silently.
      plugins: ['Dialog', 'Notify'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   pwaRegisterServiceWorker: 'src-pwa/register-sw',
    //   pwaServiceWorker: 'src-pwa/sw/custom-sw',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    //   bexManifestFile: 'src-bex/manifest.json
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        'render', // keep this as last one
      ],

      // extendSSRPackageJson (pkgJson) {},
      // extendSSRWebserverConf (rolldownConf) {},

      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      pwa: false,
      // pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!

      // extendSSRGenerateSWOptions (cfg) {},
      // extendSSRInjectManifestOptions (cfg) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      // swFilename: 'sw.js',
      // manifestFilename: 'manifest.json',
      // extendPWAManifestJson (json) {},
      // useCredentialsForManifestTag: true,
      // injectPWAMetaTags: false,
      // extendPWACustomSWConf (rolldownConf) {},
      // extendPWAGenerateSWOptions (cfg) {},
      // extendPWAInjectManifestOptions (cfg) {},
      // extendPWASwTsConfig (tsConfig) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {},

    // https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true,
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (rolldownConf) {},
      // extendElectronPreloadConf (rolldownConf) {},

      // @quasar/app-vite installs these deps (production only) in dist/electron/UnPackaged
      // right before bundling; the packager hook below then hands node_modules over to
      // resources/server/node_modules, where the backend resolves them from.
      extendElectronPackageJson() {
        return { dependencies: resolveServerRuntimeDeps() };
      },

      // Electron preload scripts (if any) from /src-electron, WITHOUT file extension
      preloadScripts: ['electron-preload'],

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: 'packager', // 'packager' or 'builder'

      packager: {
        // @electron/packager downloads the Electron ZIP itself and defaults to GitHub.
        // @electron/get keys its cache by the download URL, so a build started with the
        // GitHub URL re-downloads ~140MB even though the electron package (via .npmrc)
        // already cached the same ZIP from the mirror - that download is what used to
        // hang local builds. Naming the mirror keeps both paths on the same URL.
        download: {
          mirrorOptions: {
            mirror: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
          },
        },

        extraResource: [path.resolve(__dirname, 'server')],

        // UnPackaged/node_modules is not part of the asar: it is copied to
        // resources/server/node_modules (see afterCopyExtraResources) so the backend can
        // resolve express/knex/sqlite3/sharp/... from inside the package.
        ignore: [/^\/node_modules(\/|$)/],

        afterCopy: [
          ({ buildPath }: { buildPath: string }) => {
            const localesDir = path.join(buildPath, 'locales');
            if (fs.existsSync(localesDir)) {
              for (const file of fs.readdirSync(localesDir)) {
                if (file !== 'en-US.pak' && file !== 'zh-CN.pak') {
                  fs.unlinkSync(path.join(localesDir, file));
                }
              }
            }
          },
        ],

        afterCopyExtraResources: [
          ({ buildPath }: { buildPath: string }) => {
            const serverDir = path.join(buildPath, 'resources', 'server');
            const source = path.resolve(
              __dirname,
              'dist',
              'electron',
              'UnPackaged',
              'node_modules',
            );
            const target = path.join(serverDir, 'node_modules');

            if (!fs.existsSync(source)) {
              throw new Error(
                `[electron] no packaged dependencies found at ${source}. ` +
                  'Check extendElectronPackageJson() and the "pnpm install --prod" output above.',
              );
            }

            fs.rmSync(target, { recursive: true, force: true });
            // dereference: resources/server must contain plain files. Symlinks (pnpm's
            // default isolated node_modules) break once the build output is copied or
            // zipped for distribution. The filter drops everything the runtime never
            // loads (maps, alternate bundles, unused models, ...) - see
            // shouldSkipNodeModulesEntry.
            fs.cpSync(source, target, {
              recursive: true,
              dereference: true,
              filter: (src) => {
                const rel = path.relative(source, src).split(path.sep).join('/');
                return rel === '' || !shouldSkipNodeModulesEntry(rel);
              },
            });
            fs.rmSync(source, { recursive: true, force: true });

            preparePackagedServer(serverDir);
          },
        ],
      },

      builder: {
        // https://www.electron.build/configuration

        appId: 'game-lib',
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      // extendBexScriptsConf (rolldownConf) {},
      // extendBexManifestJson (json) {},

      /**
       * The list of extra scripts (js/ts) not in your bex manifest that you want to
       * compile and use in your browser extension. Maybe dynamic use them?
       *
       * Each entry in the list should be a relative filename to /src-bex/
       *
       * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
       */
      extraScripts: [],
    },
  };
});
