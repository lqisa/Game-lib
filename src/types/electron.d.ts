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
  openPathForRelocate(): Promise<string | null>;
  hasRunningMoveTasks(): Promise<boolean>;
  hasRunningTasks(): Promise<boolean>;
  onMoveInProgress(callback: () => void): void;
  forceQuit(): Promise<void>;
  getSseToken(): Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}