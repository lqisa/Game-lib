interface ElectronAPI {
  openDirectory(title: string): Promise<string | null>;
  openPath(path: string): Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
