import { BrowserWindow, app } from "electron";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  registerQuasarRuntime,
  resolveElectronAssetsPath
} from "#q-app/electron/main";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platform = process.platform || os.platform();

const EXPRESS_PORT = 19700;

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    import(path.resolve(__dirname, "..", "..", "server", "app.js"))
      .then(({ createApp }) => {
        import(path.resolve(__dirname, "..", "..", "server", "database", "init.js"))
          .then(({ initDatabase }) => {
            initDatabase()
              .then(() => {
                const expressApp = createApp();
                const server = expressApp.listen(EXPRESS_PORT, "127.0.0.1", () => {
                  console.log(` * Express server running on http://127.0.0.1:${EXPRESS_PORT}`);
                  resolve(EXPRESS_PORT);
                });
                server.on("error", (err: NodeJS.ErrnoException) => {
                  if (err.code === "EADDRINUSE") {
                    console.log(` * Port ${EXPRESS_PORT} in use, trying ${EXPRESS_PORT + 1}...`);
                    const retryServer = expressApp.listen(EXPRESS_PORT + 1, "127.0.0.1", () => {
                      const port = retryServer.address();
                      const actualPort = typeof port === "object" && port !== null ? port.port : EXPRESS_PORT + 1;
                      console.log(` * Express server running on http://127.0.0.1:${actualPort}`);
                      resolve(actualPort);
                    });
                  } else {
                    reject(err);
                  }
                });
              })
              .catch(reject);
          })
          .catch(reject);
      })
      .catch(reject);
  });
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

  await startServer();

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