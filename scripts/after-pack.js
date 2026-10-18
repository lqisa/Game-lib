import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * electron-builder `afterPack` hook.
 *
 * Copies the packaged backend's runtime dependencies into
 * resources/server/node_modules, where the Express server (loaded from
 * resources/server by electron-main.ts) resolves them. They cannot travel
 * through extraResources: electron-builder's copy filter unconditionally drops
 * any root-level node_modules directory of a copied file set ("filter the root
 * node_modules", app-builder-lib/out/util/filter.js) - the pre-migration
 * packager pipeline needed a custom hook for the same reason.
 *
 * The payload is prepared by scripts/prepare-packaged-server.mjs, which runs
 * before electron-builder in `pnpm build`.
 */
async function afterPack(context) {
  const source = path.join(projectDir, '.packaging', 'server', 'node_modules');
  if (!fs.existsSync(source)) {
    throw new Error(
      `[after-pack] ${source} does not exist - run scripts/prepare-packaged-server.mjs first`,
    );
  }

  const resourcesDir =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources');
  const destination = path.join(resourcesDir, 'server', 'node_modules');

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, dereference: true });
  console.log(` * [after-pack] server node_modules -> ${path.relative(projectDir, destination)}`);
}

export default afterPack;
export { afterPack };
