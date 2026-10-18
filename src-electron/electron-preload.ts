/**
 * Preload bridge: the only place the renderer gets access to desktop-only
 * features (native file dialogs, shell integration, window/tray state).
 *
 * Everything is exposed through contextBridge on `window.electronAPI`; the
 * renderer treats it as optional (`window.electronAPI?.`), because the same
 * SPA also runs in a plain browser against a standalone server, where these
 * desktop integrations do not exist.
 *
 * Built to .cjs on purpose: sandboxed preload scripts must not be ESM.
 *
 * If you extend this file, keep to electron's exposed preload APIs
 * (ipcRenderer, contextBridge, webUtils, ...) - the preload runs sandboxed.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: (title: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory', title),
  openPath: (targetPath: string): Promise<void> => ipcRenderer.invoke('shell:openPath', targetPath),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  enterLightweightMode: (): Promise<void> => ipcRenderer.invoke('app:enterLightweightMode'),
  exitLightweightMode: (): Promise<void> => ipcRenderer.invoke('app:exitLightweightMode'),
  isLightweightMode: (): Promise<boolean> => ipcRenderer.invoke('app:isLightweightMode'),
  setAutoStart: (enabled: boolean): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('app:setAutoStart', enabled),
  getAutoStart: (): Promise<boolean> => ipcRenderer.invoke('app:getAutoStart'),
  setCloseToTray: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('app:setCloseToTray', enabled),
  getCloseToTray: (): Promise<boolean> => ipcRenderer.invoke('app:getCloseToTray'),
  openPathForRelocate: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openPathForRelocate'),
  hasRunningMoveTasks: (): Promise<boolean> => ipcRenderer.invoke('tasks:hasRunningMoveTasks'),
  hasRunningTasks: (): Promise<boolean> => ipcRenderer.invoke('tasks:hasRunningTasks'),
  onMoveInProgress: (callback: () => void) => {
    ipcRenderer.on('task:move-in-progress', callback);
  },
  forceQuit: (): Promise<void> => ipcRenderer.invoke('app:forceQuit'),
  getSseToken: (): Promise<string> => ipcRenderer.invoke('app:getSseToken'),
  readyForBackgroundTasks: (): Promise<void> => ipcRenderer.invoke('app:readyForBackgroundTasks'),
});
