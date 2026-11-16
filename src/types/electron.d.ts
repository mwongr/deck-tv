export interface UpdateInfo {
  version: string;
  files?: Array<{ url: string; size: number }>;
  releaseDate?: string;
  releaseNotes?: string | Array<{ version: string; note: string }>;
}

export interface ProgressInfo {
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

export interface ElectronUpdaterAPI {
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (error: string) => void) => () => void;
  restartApp: () => void;
  checkForUpdates?: () => void;
}

declare global {
  interface Window {
    electronUpdater?: ElectronUpdaterAPI;
  }
}
