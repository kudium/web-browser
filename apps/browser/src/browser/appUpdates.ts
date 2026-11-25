export type AppUpdateAction = 'get' | 'check' | 'download' | 'install';
export interface AppUpdateState {
  status:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'restarting'
    | 'error';
  currentVersion: string;
  version?: string;
  progress?: number;
  message?: string;
  checkedAt?: number;
}
export interface AppUpdatePreferences {
  automaticallyDownloadUpdates: boolean;
  automaticallyInstallUpdates: boolean;
}
