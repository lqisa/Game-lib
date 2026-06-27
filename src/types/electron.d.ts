interface ElectronAPI {
  openDirectory(title: string): Promise<string | null>;
  openPath(path: string): Promise<void>;
  getFilePath(file: File): string;
}

interface Window {
  electronAPI?: ElectronAPI;
}