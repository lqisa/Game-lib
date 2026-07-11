interface ElectronAPI {
  openDirectory(title: string): Promise<string | null>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  getFilePath(file: File): string;
  enterLightweightMode(): Promise<void>;
  exitLightweightMode(): Promise<void>;
  isLightweightMode(): Promise<boolean>;
  setAutoStart(enabled: boolean): Promise<void>;
  getAutoStart(): Promise<boolean>;
  setCloseToTray(enabled: boolean): Promise<void>;
  getCloseToTray(): Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}