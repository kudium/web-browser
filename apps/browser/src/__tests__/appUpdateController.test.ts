import { EventEmitter } from 'events';
import { AppUpdateController } from '../main/appUpdateController';

function fixture(autoDownload = true, autoInstall = true) {
  const driver = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: true,
    checkForUpdates: jest.fn(async () => {}),
    downloadUpdate: jest.fn(async () => {}),
    quitAndInstall: jest.fn(),
  });
  const preferences = {
    automaticallyDownloadUpdates: autoDownload,
    automaticallyInstallUpdates: autoInstall,
  };
  const publish = jest.fn();
  const controller = new AppUpdateController(
    driver,
    '1.0.1',
    () => preferences,
    publish
  );
  return { driver, preferences, controller, publish };
}
const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

it('downloads by default but never restarts on discovery or download', async () => {
  const { driver, controller } = fixture();
  driver.emit('update-available', { version: '1.0.2' });
  expect(controller.get().status).toBe('downloading');
  await flush();
  expect(driver.downloadUpdate).toHaveBeenCalledTimes(1);
  driver.emit('download-progress', { percent: 48.6 });
  expect(controller.get().progress).toBe(48.6);
  driver.emit('update-downloaded', { version: '1.0.2' });
  expect(controller.get().status).toBe('ready');
  expect(driver.quitAndInstall).not.toHaveBeenCalled();
  expect(driver.autoInstallOnAppQuit).toBe(false);
  controller.install();
  controller.install();
  expect(driver.autoRunAppAfterInstall).toBe(true);
  expect(driver.quitAndInstall).toHaveBeenCalledTimes(1);
});

it('requires an explicit download when automatic downloads are disabled', async () => {
  const { driver, controller } = fixture(false);
  driver.emit('update-available', { version: '1.0.2' });
  await flush();
  expect(driver.downloadUpdate).not.toHaveBeenCalled();
  const first = controller.download();
  expect(controller.download()).toBe(first);
  await first;
  expect(driver.downloadUpdate).toHaveBeenCalledTimes(1);
});

it('applies live download policy, leaves an existing download running', async () => {
  const { driver, controller, preferences } = fixture(false);
  driver.emit('update-available', { version: '1.0.2' });
  preferences.automaticallyDownloadUpdates = true;
  controller.applyPreferences();
  preferences.automaticallyDownloadUpdates = false;
  controller.applyPreferences();
  await flush();
  expect(driver.downloadUpdate).toHaveBeenCalledTimes(1);
});

it('honors install-on-quit changes after download and does not relaunch on normal quit', () => {
  const { driver, controller, preferences } = fixture();
  driver.emit('update-available', { version: '1.0.2' });
  driver.emit('update-downloaded', { version: '1.0.2' });
  preferences.automaticallyInstallUpdates = false;
  controller.applyPreferences();
  expect(controller.installOnQuit()).toBe(false);
  expect(driver.quitAndInstall).not.toHaveBeenCalled();
  preferences.automaticallyInstallUpdates = true;
  controller.applyPreferences();
  expect(controller.installOnQuit()).toBe(true);
  expect(controller.installOnQuit()).toBe(false);
  expect(driver.autoRunAppAfterInstall).toBe(false);
  expect(driver.quitAndInstall).toHaveBeenCalledTimes(1);
});

it('ignores unsolicited or mismatched archives and late or malformed progress', async () => {
  const { driver, controller } = fixture(false);
  driver.emit('update-downloaded', { version: '0.9.0' });
  driver.emit('download-progress', { percent: 50 });
  expect(controller.get().status).toBe('idle');
  driver.emit('update-available', { version: '1.0.2' });
  await controller.download();
  [NaN, Infinity, -Infinity].forEach((percent) =>
    driver.emit('download-progress', { percent })
  );
  expect(controller.get().progress).toBe(0);
  driver.emit('update-downloaded', { version: '1.0.3' });
  expect(controller.get().status).toBe('downloading');
  expect(() => controller.install()).toThrow('Download');
  driver.emit('update-downloaded', { version: '1.0.2' });
  driver.emit('download-progress', { percent: 5 });
  expect(controller.get()).toMatchObject({
    status: 'ready',
    version: '1.0.2',
    progress: 100,
  });
});

it('coalesces checks, preserves available and downloaded updates after errors', async () => {
  const { driver, controller } = fixture(false);
  driver.checkForUpdates.mockImplementation(async () => {
    driver.emit('update-not-available');
  });
  const first = controller.check();
  expect(controller.check()).toBe(first);
  await first;
  expect(controller.get()).toMatchObject({
    status: 'idle',
    checkedAt: expect.any(Number),
  });
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
  driver.emit('update-available', { version: '1.0.2' });
  driver.checkForUpdates.mockRejectedValue(new Error('offline'));
  await controller.check();
  expect(controller.get()).toMatchObject({
    status: 'available',
    version: '1.0.2',
  });
  driver.emit('update-downloaded', { version: '1.0.2' });
  driver.emit('error', new Error('offline'));
  expect(controller.get().status).toBe('ready');
  await controller.check();
  expect(driver.checkForUpdates).toHaveBeenCalledTimes(2);
});

it('allows download retry and rejects installation before download', async () => {
  const { driver, controller } = fixture(false);
  expect(() => controller.install()).toThrow('Download');
  driver.emit('update-available', { version: '1.0.2' });
  driver.downloadUpdate.mockRejectedValueOnce(new Error('offline'));
  await controller.download();
  expect(controller.get()).toMatchObject({
    status: 'available',
    message: expect.any(String),
  });
  await controller.download();
  expect(driver.downloadUpdate).toHaveBeenCalledTimes(2);
});


it.each(['event', 'throw'])('explains a full disk during installation via %s and permits retry', (method) => {
  const { driver, controller } = fixture(false);
  driver.emit('update-available', { version: '1.0.2' });
  driver.emit('update-downloaded', { version: '1.0.2' });
  const error = new Error('ditto: app.asar: No space left on device');
  if (method === 'throw') {
    driver.quitAndInstall.mockImplementationOnce(() => { throw error; });
    expect(() => controller.install()).toThrow(error);
  } else { controller.install(); driver.emit('error', error); }
  expect(controller.get()).toMatchObject({ status: 'ready', message: 'Not enough disk space to install the update. Free up space on your Mac, then try again.' });
  controller.install();
  expect(driver.quitAndInstall).toHaveBeenCalledTimes(2);
});
