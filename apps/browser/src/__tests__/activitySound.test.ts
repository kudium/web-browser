/** @jest-environment node */
import { BrowserWindow, shell } from 'electron';
import { execFile } from 'child_process';
import { playActivitySound } from '../main/activitySound';

jest.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: jest.fn(),
  shell: { beep: jest.fn() },
}));
jest.mock('child_process', () => ({ execFile: jest.fn() }));
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
});
afterEach(() => Object.defineProperty(process, 'platform', platform));

test('plays the selected built-in sound without a shell', () => {
  playActivitySound('Glass');
  expect(execFile).toHaveBeenCalledWith(
    '/usr/bin/afplay',
    ['/System/Library/Sounds/Glass.aiff'],
    { timeout: 5000 },
    expect.any(Function)
  );
  expect(shell.beep).not.toHaveBeenCalled();
});

test.each(['system', '../private', 'Glass;echo secret', 'toString'])(
  'uses the system alert instead of executing invalid or default selection %s',
  (name) => {
    playActivitySound(name);
    expect(execFile).not.toHaveBeenCalled();
    expect(shell.beep).toHaveBeenCalledTimes(1);
  }
);

test('falls back if a built-in sound is unavailable', () => {
  playActivitySound('Ping');
  const callback = (execFile as unknown as jest.Mock).mock.calls[0][3];
  callback(new Error('Missing sound'));
  expect(shell.beep).toHaveBeenCalledTimes(1);
});

test('uses the system alert on other platforms', () => {
  Object.defineProperty(process, 'platform', { value: 'win32' });
  playActivitySound('Glass');
  expect(execFile).not.toHaveBeenCalled();
  expect(shell.beep).toHaveBeenCalledTimes(1);
});

test.each(['darwin', 'win32', 'linux'])(
  'bundled chime uses the same packaged audio engine on %s',
  (target) => {
    Object.defineProperty(process, 'platform', { value: target });
    const window = {
      isDestroyed: () => true,
      destroy: jest.fn(),
      loadURL: jest.fn((_url: string) => new Promise(() => {})),
    };
    (BrowserWindow as unknown as jest.Mock).mockImplementation(() => window);
    playActivitySound('chime');
    expect(shell.beep).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        show: false,
        webPreferences: expect.objectContaining({
          sandbox: true,
          nodeIntegration: false,
          autoplayPolicy: 'no-user-gesture-required',
        }),
      })
    );
    const html = decodeURIComponent(
      window.loadURL.mock.calls[0][0].split(',').slice(1).join(',')
    );
    const audio = html.match(/data:audio\/wav;base64,([^" ]+)/)![1];
    expect(Buffer.from(audio, 'base64').subarray(0, 4).toString()).toBe('RIFF');
  }
);
