/**
 * This file is used specifically for security reasons.
 * Here you can access Nodejs stuff and inject functionality into
 * the renderer thread (accessible there through the "window" object)
 *
 * WARNING!
 * If you import anything from node_modules, then make sure that the package is specified
 * in /src-electron/package.json > dependencies and NOT in devDependencies
 *
 * Example (injects window.myAPI.doAThing() into renderer thread):
 *
 *   import { contextBridge } from 'electron'
 *
 *   contextBridge.exposeInMainWorld('myAPI', {
 *     doAThing: () => {}
 *   })
 *
 * WARNING!
 * If accessing Node functionality (like importing @electron/remote) then in your
 * electron-main.ts you will need to set the following when you instantiate BrowserWindow:
 *
 * mainWindow = new BrowserWindow({
 *   // ...
 *   webPreferences: {
 *     // ...
 *     sandbox: false // <-- to be able to import @electron/remote in preload script
 *   }
 * }
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { quasarRuntime } from '#q-app/electron/preload';

contextBridge.exposeInMainWorld('quasarRuntime', quasarRuntime);

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: (title: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory', title),
  openPath: (targetPath: string): Promise<void> => ipcRenderer.invoke('shell:openPath', targetPath),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  enterLightweightMode: (): Promise<void> => ipcRenderer.invoke('app:enterLightweightMode'),
  exitLightweightMode: (): Promise<void> => ipcRenderer.invoke('app:exitLightweightMode'),
  isLightweightMode: (): Promise<boolean> => ipcRenderer.invoke('app:isLightweightMode'),
  setAutoStart: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:setAutoStart', enabled),
  getAutoStart: (): Promise<boolean> => ipcRenderer.invoke('app:getAutoStart'),
  setCloseToTray: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:setCloseToTray', enabled),
  getCloseToTray: (): Promise<boolean> => ipcRenderer.invoke('app:getCloseToTray'),
  openPathForRelocate: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openPathForRelocate'),
});