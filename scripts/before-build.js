/**
 * electron-builder `beforeBuild` hook.
 *
 * Returning false tells electron-builder that node_modules are handled outside
 * of it ("If beforeBuild resolves to false, it means that handling node_modules
 * is done outside of electron-builder", app-builder-lib packager.js). That
 * skips two things, both unwanted here:
 *
 *   - the native dependency install/rebuild: sqlite3/sharp come from
 *     scripts/prepare-packaged-server.mjs with the Node ABI the backend
 *     actually runs on, so an Electron ABI rebuild would produce binaries
 *     nothing loads;
 *   - packing the root package.json's production node_modules into app.asar:
 *     the app bundle (main/preload/renderer) is fully bundled by electron-vite
 *     and needs none of them, and the backend's own copy is added to
 *     resources/server/node_modules by scripts/after-pack.js.
 */
async function beforeBuild() {
  return false;
}

export default beforeBuild;
export { beforeBuild };
