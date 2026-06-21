import { BrowserWindow, app, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  registerQuasarRuntime,
  resolveElectronAssetsPath
} from "#q-app/electron/main";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platform = process.platform || os.platform();

const EXPRESS_PORT = 19700;
let currentServer: http.Server | null = null;

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

  const frontendDir = path.resolve(__dirname);
  const expressApp = createApp(frontendDir);

  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      const server = expressApp.listen(port, "127.0.0.1", () => {
        currentServer = server;
        console.log(` * Express server running on http://127.0.0.1:${port}`);
        resolve(port);
      });
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port === EXPRESS_PORT) {
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

async function createWindow() {
  const mainWindow = new BrowserWindow({
    icon: resolveElectronAssetsPath("icons/icon.png"),
    width: 1200,
    height: 800,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(import.meta.dirname, "electron-preload.cjs"),
    },
  });

  if (import.meta.env.QUASAR_DEV) {
    await mainWindow.loadURL(import.meta.env.QUASAR_APP_URL);
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${EXPRESS_PORT}`);
  }

  if (import.meta.env.QUASAR_DEBUG) {
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow?.webContents.closeDevTools();
    });
  }
}

void app.whenReady().then(async () => {
  await registerQuasarRuntime();

  const userDataDir = app.getPath('userData')
  process.env.GAME_LIB_DATA_DIR = userDataDir

  ipcMain.handle('dialog:openDirectory', async (_event, title: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: title || 'Select Directory'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    await shell.openPath(targetPath)
  })

  await startServer();

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

  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (platform !== "darwin") {
    app.quit();
  }
});