import type {
  AppUpdatePreferences,
  AppUpdateState,
} from '../browser/appUpdates';

export interface UpdateDriver {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  autoRunAppAfterInstall: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

/** Own update policy without letting a background check restart the browser. */
export class AppUpdateController {
  private state: AppUpdateState;

  private installing = false;

  private checking?: Promise<AppUpdateState>;

  private downloading?: Promise<AppUpdateState>;

  constructor(
    private driver: UpdateDriver,
    currentVersion: string,
    private preferences: () => AppUpdatePreferences,
    private publish: (state: AppUpdateState) => void
  ) {
    this.state = { status: 'idle', currentVersion };
    // Download explicitly so policy, progress and retries share one operation.
    driver.autoDownload = false;
    this.applyPreferences();
    driver.on('update-available', (info: { version: string }) => {
      if (this.state.status === 'ready' || this.state.status === 'downloading')
        return;
      this.set({
        status: 'available',
        version: info.version,
        message: undefined,
      });
      if (this.preferences().automaticallyDownloadUpdates) this.download();
    });
    driver.on('update-not-available', () => {
      if (['ready', 'downloading', 'available'].includes(this.state.status))
        return;
      this.set({ status: 'idle', version: undefined, message: undefined });
    });
    driver.on('download-progress', (progress: { percent: number }) => {
      if (
        this.state.status !== 'downloading' ||
        !Number.isFinite(progress?.percent)
      )
        return;
      this.set({
        status: 'downloading',
        progress: Math.max(0, Math.min(100, progress.percent)),
        message: undefined,
      });
    });
    driver.on('update-downloaded', (info: { version: string }) => {
      if (
        !['available', 'downloading'].includes(this.state.status) ||
        info?.version !== this.state.version
      )
        return;
      this.set({
        status: 'ready',
        version: info.version,
        progress: 100,
        message: undefined,
      });
    });
    driver.on('error', () => this.failed());
  }

  get = (): AppUpdateState => ({ ...this.state });

  private set(patch: Partial<AppUpdateState>) {
    this.state = { ...this.state, ...patch };
    this.publish(this.get());
  }

  private failed() {
    const wasInstalling = this.installing;
    this.installing = false;
    // Keep a downloaded update usable, and a known update available to retry.
    let status: AppUpdateState['status'] = 'error';
    if (this.state.status === 'ready') status = 'ready';
    else if (this.state.version) status = 'available';
    this.set({
      status,
      message: wasInstalling
        ? 'Unable to install the update. Try again.'
        : 'Unable to reach the update service. Try again.',
      progress: undefined,
    });
  }

  applyPreferences() {
    // Keep native staging off until installation is chosen. On macOS, staging
    // itself commits Squirrel to installing on quit, even if the setting changes.
    this.driver.autoInstallOnAppQuit = false;
    if (
      this.state.status === 'available' &&
      this.preferences().automaticallyDownloadUpdates
    )
      this.download();
  }

  check(): Promise<AppUpdateState> {
    if (this.checking) return this.checking;
    if (this.downloading || this.state.status === 'ready')
      return Promise.resolve(this.get());
    if (!this.state.version)
      this.set({ status: 'checking', message: undefined });
    this.checking = Promise.resolve()
      .then(() => this.driver.checkForUpdates())
      .then(
        () => {
          this.set({ checkedAt: Date.now() });
          return this.get();
        },
        () => {
          this.failed();
          return this.get();
        }
      )
      .finally(() => {
        this.checking = undefined;
      });
    return this.checking;
  }

  download(): Promise<AppUpdateState> {
    if (this.downloading) return this.downloading;
    if (this.state.status !== 'available') return Promise.resolve(this.get());
    this.set({ status: 'downloading', progress: 0, message: undefined });
    this.downloading = Promise.resolve()
      .then(() => this.driver.downloadUpdate())
      .then(
        () => this.get(),
        () => {
          this.failed();
          return this.get();
        }
      )
      .finally(() => {
        this.downloading = undefined;
      });
    return this.downloading;
  }

  install(restart = true) {
    if (this.state.status !== 'ready')
      throw new Error('Download the update before installing it.');
    if (this.installing) return this.get();
    this.installing = true;
    this.driver.autoRunAppAfterInstall = restart;
    try {
      this.driver.quitAndInstall();
    } catch (error) {
      this.failed();
      throw error;
    }
    return this.get();
  }

  installOnQuit() {
    if (
      this.installing ||
      this.state.status !== 'ready' ||
      !this.preferences().automaticallyInstallUpdates
    )
      return false;
    this.install(false);
    return true;
  }
}
