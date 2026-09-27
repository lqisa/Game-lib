import {
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  app,
  ipcMain,
  dialog,
  shell,
  powerMonitor,
} from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerQuasarRuntime, resolveElectronAssetsPath } from '#q-app/electron/main';
import { getDataDir, ensureDir } from '../server/config.js';
import { decideListenRetry, portInUseMessage } from '../server/port-policy.js';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    lightweightMode = false;
    void createWindow();
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platform = process.platform || os.platform();

const EXPRESS_PORT = 19700;
// The port the Express server actually bound to. In production it can differ from
// EXPRESS_PORT (see the EADDRINUSE retry in startServer), so the window must always be
// loaded from this value rather than the constant.
let expressPort = EXPRESS_PORT;
let currentServer: http.Server | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let lightweightMode = false;
let closeToTray = false;
let hasRunningMoveTasksFn: (() => boolean) | null = null;
let hasRunningTasksFn: (() => boolean) | null = null;
// Queued or in-flight tasks of any type - the exit guards use this one.
let hasActiveTasksFn: (() => boolean) | null = null;
let sseToken: string;

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}
let savedBounds: WindowBounds | null = null;
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;
let dbSetSetting: ((key: string, value: string) => Promise<void>) | null = null;

function getServerDir(): string {
  if (import.meta.env.QUASAR_DEV) {
    return path.resolve(__dirname, '..', '..', '..', 'server');
  }
  return path.join(process.resourcesPath, 'server');
}

async function startServer(): Promise<number> {
  const serverDir = getServerDir();
  const cacheBuster = `?t=${Date.now()}`;
  const appUrl = pathToFileURL(path.resolve(serverDir, 'app.js')).href + cacheBuster;
  const initUrl = pathToFileURL(path.resolve(serverDir, 'database', 'init.js')).href;

  const { createApp } = await import(appUrl);
  const { initDatabase } = await import(initUrl);
  await initDatabase();
  const proxyUrl = pathToFileURL(path.resolve(serverDir, 'scraper', 'axios.js')).href;
  const { initProxy } = await import(proxyUrl);
  await initProxy();

  // Same hook as the dev server: one historical scan on first boot, then polling for new
  // adoptions.
  const similarUrl = pathToFileURL(path.resolve(serverDir, 'similar.js')).href;
  const { maybeStartSimilarScan, startSimilarScanPolling } = await import(similarUrl);
  void maybeStartSimilarScan();
  startSimilarScanPolling();

  const nsfwUrl = pathToFileURL(path.resolve(serverDir, 'nsfw-classifier.js')).href;
  const { startNsfwPolling } = await import(nsfwUrl);
  startNsfwPolling();

  const frontendDir = path.resolve(__dirname);
  const expressApp = createApp(frontendDir);

  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      const server = expressApp.listen(port, '127.0.0.1', () => {
        currentServer = server;
        expressPort = port;
        console.log(` * Express server running on http://127.0.0.1:${port}`);
        resolve(port);
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        const decision = decideListenRetry({
          errorCode: err.code,
          port,
          startPort: EXPRESS_PORT,
          isDev: Boolean(import.meta.env.QUASAR_DEV),
        });
        if (decision.action === 'retry') {
          console.log(` * Port ${port} in use, trying ${decision.port}...`);
          tryListen(decision.port);
          return;
        }
        // Dev cannot move ports (the renderer's API base url is baked from
        // VITE_API_PORT), so surface an actionable error instead of a bind failure.
        if (decision.reason === 'dev-port-fixed') {
          reject(new Error(portInUseMessage(port)));
          return;
        }
        reject(err);
      });
    };
    tryListen(EXPRESS_PORT);
  });
}

async function restartServer(): Promise<void> {
  if (currentServer) {
    await new Promise<void>((resolve) => currentServer!.close(() => resolve()));
    currentServer = null;
  }
  await startServer();
  console.log(' * Server restarted');
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  savedBounds = { ...bounds, isMaximized };
  if (dbSetSetting) {
    void dbSetSetting('window_bounds', JSON.stringify(savedBounds));
  }
}

function scheduleSaveWindowBounds() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveWindowBounds, 500);
}

function destroyWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  mainWindow = null;
}

function createTray() {
  const iconPath = resolveElectronAssetsPath('icons/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        lightweightMode = false;
        void createWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Game Lib');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    lightweightMode = false;
    void createWindow();
  });
}

async function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    icon: resolveElectronAssetsPath('icons/icon.png'),
    width: savedBounds?.width ?? 1200,
    height: savedBounds?.height ?? 800,
    ...(savedBounds?.x != null && { x: savedBounds.x }),
    ...(savedBounds?.y != null && { y: savedBounds.y }),
    useContentSize: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(import.meta.dirname, 'electron-preload.cjs'),
      backgroundThrottling: true,
      spellcheck: false,
    },
  });

  if (savedBounds?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);
  mainWindow.on('maximize', scheduleSaveWindowBounds);
  mainWindow.on('unmaximize', scheduleSaveWindowBounds);

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      if (closeToTray) {
        e.preventDefault();
        lightweightMode = true;
        destroyWindow();
      }
    }
  });

  if (import.meta.env.QUASAR_DEV) {
    await mainWindow.loadURL(import.meta.env.QUASAR_APP_URL);
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${expressPort}`);
  }

  if (import.meta.env.QUASAR_DEBUG) {
    mainWindow.webContents.openDevTools();
  }

  if (!lightweightMode) {
    mainWindow.show();
  }
}

void app.whenReady().then(async () => {
  await registerQuasarRuntime();

  if (!import.meta.env.QUASAR_DEV) {
    process.env.GAME_LIB_PROD = '1';
  } else {
    // A dev run can leave an auto-start entry pointing at the shared electron.exe, which
    // launches a bare Electron (its own welcome page) at login. Dev cannot auto-start, so
    // remove the dev-named entry. Do NOT gate this on getLoginItemSettings(): the stored
    // entry carries `--hidden`, and Electron reports openAtLogin === false for it because
    // the args do not match, so that check silently misses exactly this case.
    // The packaged build's entry has a different name, so this cannot remove it.
    try {
      app.setLoginItemSettings({ openAtLogin: false });
      console.log(' * Cleared any dev auto-start entry (dev builds cannot auto-start).');
    } catch {
      /* not critical */
    }
  }

  const startHidden =
    app.commandLine.hasSwitch('hidden') ||
    (platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden);
  if (startHidden) {
    lightweightMode = true;
  }

  // Generate SSE token for authentication
  sseToken = crypto.randomBytes(32).toString('hex');

  ipcMain.handle('dialog:openDirectory', async (_event, title: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: title || 'Select Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    await shell.openPath(targetPath);
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('app:enterLightweightMode', () => {
    lightweightMode = true;
    destroyWindow();
  });

  ipcMain.handle('app:exitLightweightMode', async () => {
    lightweightMode = false;
    await createWindow();
  });

  ipcMain.handle('app:isLightweightMode', () => {
    return lightweightMode;
  });

  ipcMain.handle('app:setAutoStart', (_event, enabled: boolean) => {
    // Auto-start can only work for the installed build. In dev process.execPath is the
    // shared electron.exe and the app is passed as a script argument, so a login entry
    // would launch a bare Electron (its default welcome page) instead of this app.
    if (!app.isPackaged) {
      // Remove unconditionally - see the note in whenReady(): getLoginItemSettings()
      // cannot detect the entry because its stored args include `--hidden`.
      app.setLoginItemSettings({ openAtLogin: false });
      return { ok: false, reason: 'not-packaged' };
    }
    if (platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? ['--hidden'] : [],
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: enabled,
      });
    }
    return { ok: true };
  });

  ipcMain.handle('app:getAutoStart', () => {
    // Report "off" in dev, where the setting cannot be honoured.
    if (!app.isPackaged) return false;
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('app:setCloseToTray', (_event, enabled: boolean) => {
    closeToTray = enabled;
  });

  ipcMain.handle('app:getCloseToTray', () => {
    return closeToTray;
  });

  ipcMain.handle('dialog:openPathForRelocate', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'openFile'],
      title: 'Select Game Path',
      filters: [
        { name: 'Archives', extensions: ['zip', '7z', 'rar', '001'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('tasks:hasRunningMoveTasks', () => {
    return hasRunningMoveTasksFn?.() ?? false;
  });

  ipcMain.handle('tasks:hasRunningTasks', () => {
    return hasRunningTasksFn?.() ?? false;
  });

  ipcMain.handle('app:getSseToken', () => {
    return sseToken;
  });

  ipcMain.handle('app:forceQuit', () => {
    isQuitting = true;
    app.quit();
  });

  // Pass SSE token to Express server via env
  process.env.SSE_TOKEN = sseToken;

  // Also write token to file for dev mode (separate Node process)
  try {
    const dataDir = getDataDir();
    ensureDir(dataDir);
    fs.writeFileSync(path.join(dataDir, '.sse-token'), sseToken);
  } catch {
    /* ignore */
  }

  await startServer();

  // Cache task functions for synchronous shutdown checks
  try {
    const tasksModule = await import(pathToFileURL(path.resolve(getServerDir(), 'tasks.js')).href);
    hasRunningMoveTasksFn = tasksModule.hasRunningMoveTasks;
    hasRunningTasksFn = tasksModule.hasRunningTasks;
    hasActiveTasksFn = tasksModule.hasActiveTasks;
  } catch {
    hasRunningMoveTasksFn = () => false;
    hasRunningTasksFn = () => false;
    hasActiveTasksFn = () => false;
  }

  try {
    const dbModule = await import(
      pathToFileURL(path.resolve(getServerDir(), 'database', 'db.js')).href
    );
    const { getSetting, setSetting } = dbModule;
    dbSetSetting = setSetting;

    const closeToTrayVal = await getSetting('close_to_tray');
    closeToTray = closeToTrayVal === 'true';

    const boundsVal = await getSetting('window_bounds');
    if (boundsVal) {
      savedBounds = JSON.parse(boundsVal);
    }
  } catch {
    closeToTray = false;
  }

  if (import.meta.env.QUASAR_DEV) {
    const serverDir = getServerDir();
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    fs.watch(serverDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.js') && !filename.endsWith('.ts')) return;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        void restartServer();
      }, 500);
    });
  }

  createTray();

  if (!lightweightMode) {
    void createWindow();
  }

  app.on('activate', () => {
    if (platform === 'darwin') {
      if (!mainWindow) {
        void createWindow();
      } else {
        mainWindow.show();
      }
    }
  });
});

app.on('before-quit', (e) => {
  if (isQuitting) return;
  // Any active task blocks the quit, not just moves: quitting during an extraction leaves a
  // half-extracted target directory and the game row still pointing at the archive.
  if (hasActiveTasksFn?.()) {
    e.preventDefault();
    isQuitting = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task:move-in-progress');
    }
  } else {
    isQuitting = true;
  }
});

app.on('window-all-closed', () => {
  if (!closeToTray) {
    app.quit();
  }
});

(powerMonitor as unknown as NodeJS.EventEmitter).on(
  'shutdown',
  (e: { preventDefault: () => void }) => {
    // Same rule on OS shutdown, otherwise the task is killed with the machine.
    if (hasActiveTasksFn?.()) {
      e.preventDefault();
    }
  },
);