import { app } from 'electron';
import { restrictPackagedDebugging } from '../main/runtimeSecurity';

jest.mock('electron', () => ({
  app: { isPackaged: true, commandLine: { removeSwitch: jest.fn() } },
}));

it('removes both Chromium debugging transports and their access configuration from release apps', () => {
  restrictPackagedDebugging();
  expect(app.commandLine.removeSwitch).toHaveBeenCalledWith(
    'remote-debugging-port'
  );
  expect(app.commandLine.removeSwitch).toHaveBeenCalledWith(
    'remote-debugging-pipe'
  );
  expect(app.commandLine.removeSwitch).toHaveBeenCalledWith(
    'remote-debugging-address'
  );
  expect(app.commandLine.removeSwitch).toHaveBeenCalledWith(
    'remote-allow-origins'
  );
});

it('preserves debugging during development', () => {
  (app as any).isPackaged = false;
  (app.commandLine.removeSwitch as jest.Mock).mockClear();
  try {
    restrictPackagedDebugging();
    expect(app.commandLine.removeSwitch).not.toHaveBeenCalled();
  } finally {
    (app as any).isPackaged = true;
  }
});
