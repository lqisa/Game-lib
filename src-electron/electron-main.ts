import { BrowserWindow, Tray, Menu, nativeImage, app, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerQuasarRuntime, resolveElectronAssetsPath } from '#q-app/electron/main';

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-features', 'MediaSessionService,HardwareMediaKeyHandling');
app.commandLine.appendSwitch('enable-features', 'LowResImageCache');
app.disableHardwareAcceleration();

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
let currentServer: http.Server | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let lightweightMode = false;
let closeToTray = false;

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

  const frontendDir = path.resolve(__dirname);
  const expressApp = createApp(frontendDir);

  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      const server = expressApp.listen(port, '127.0.0.1', () => {
        currentServer = server;
        console.log(` * Express server running on http://127.0.0.1:${port}`);
        resolve(port);
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && port === EXPRESS_PORT) {
          console.log(` * Port ${port} in use, trying ${port + 1}...`);
          tryListen(port + 1);
        } else {
          reject(err);
        }
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
    await mainWindow.loadURL(`http://127.0.0.1:${EXPRESS_PORT}`);
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

  const userDataDir = app.getPath('userData');
  process.env.GAME_LIB_DATA_DIR = userDataDir;

  const startHidden = app.commandLine.hasSwitch('hidden')
    || (platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden);
  if (startHidden) {
    lightweightMode = true;
  }

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
  });

  ipcMain.handle('app:getAutoStart', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('app:setCloseToTray', (_event, enabled: boolean) => {
    closeToTray = enabled;
  });

  ipcMain.handle('app:getCloseToTray', () => {
    return closeToTray;
  });

  await startServer();

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

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (!closeToTray) {
    app.quit();
  }
});