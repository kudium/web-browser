/* eslint class-methods-use-this: off */
import { app, ipcMain } from 'electron';
import {
  safeErrorType,
  telemetryFeature,
  safeErrorFrames,
  validatedErrorFrames,
} from '../browser/telemetry';
import {
  registerTelemetry,
  trackFeature,
  trackAppError,
} from '../main/telemetry';

const mockCapture = jest.fn();
const mockException = jest.fn();
const mockFetch = jest.fn(async () => ({
  status: 200,
  text: async () => '',
  json: async () => ({}),
}));
const mockClients: any[] = [];
let mockEnabled = true;
let mockChanged: () => void;
const mockUnlink = jest.fn();
jest.mock('fs', () => ({
  readFileSync: () => '12345678-1234-1234-1234-123456789012',
  writeFileSync: jest.fn(),
  unlinkSync: (...args: any[]) => mockUnlink(...args),
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({ shareUsageDiagnostics: mockEnabled }),
  onBrowserPreferencesChanged: (callback: () => void) => {
    mockChanged = callback;
  },
}));
jest.mock('electron', () => {
  const { EventEmitter } = jest.requireActual('events');
  return {
    app: Object.assign(new EventEmitter(), {
      isPackaged: true,
      getVersion: () => '1.0.0',
      getPath: () => '/tmp/kudium-telemetry-test',
      whenReady: () => Promise.resolve(),
      quit: jest.fn(),
    }),
    ipcMain: new EventEmitter(),
  };
});
jest.mock('posthog-node', () => ({
  PostHog: class {
    options: any;

    constructor(_key: string, options: any) {
      this.options = options;
      mockClients.push(this);
    }

    on() {}

    capture = mockCapture;

    captureException = mockException;

    fetch(...args: any[]) {
      return mockFetch(...(args as []));
    }

    flush = jest.fn(async () => {});

    shutdown = jest.fn(async () => {});
  },
}));
const frame = {};
const sender = { mainFrame: frame };
beforeAll(async () => {
  registerTelemetry((contents) => contents === (sender as any));
  await Promise.resolve();
});
beforeEach(() => {
  mockCapture.mockClear();
  mockException.mockClear();
});

it('accepts only enumerated features and error classes', () => {
  expect(telemetryFeature('file_saved')).toBe(true);
  expect(telemetryFeature('https://private.example')).toBe(false);
  expect(safeErrorType('TypeError')).toBe('TypeError');
  expect(safeErrorType('token=secret')).toBe('Error');
});
it('never includes extra user content in events, errors or stacks', () => {
  ipcMain.emit(
    'kudium-telemetry',
    { sender, senderFrame: frame },
    {
      feature: 'file_saved',
      succeeded: false,
      errorType: 'TypeError',
      path: '/private/file',
      message: 'secret',
      stack: 'secret',
      prompt: 'secret',
    }
  );
  expect(mockCapture.mock.calls[0][0]).toMatchObject({
    event: 'feature_used',
    properties: {
      feature: 'file_saved',
      succeeded: false,
      $process_person_profile: false,
    },
  });
  const [error, , props] = mockException.mock.calls[0];
  expect(error.name).toBe('TypeError');
  expect(error.stack).toBe('TypeError: Kudium operation error (file_saved)');
  expect(JSON.stringify([mockCapture.mock.calls, props])).not.toMatch(
    /private|secret|prompt/
  );
});
it('rejects external senders and subframes', () => {
  ipcMain.emit(
    'kudium-telemetry',
    { sender: {}, senderFrame: frame },
    { feature: 'ai_run' }
  );
  ipcMain.emit(
    'kudium-telemetry',
    { sender, senderFrame: {} },
    { feature: 'ai_run' }
  );
  expect(mockCapture).not.toHaveBeenCalled();
});
it('blocks queued transport after opt-out and retires the old client', async () => {
  const previous = mockClients[0];
  mockEnabled = false;
  mockChanged();
  trackFeature('ai_run');
  trackAppError('TypeError', 'main');
  await previous.fetch('https://us.i.posthog.com/batch/', {});
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockException).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockUnlink).toHaveBeenCalled();
  mockEnabled = true;
  mockChanged();
  await previous.fetch('https://us.i.posthog.com/batch/', {});
  expect(mockFetch).not.toHaveBeenCalled();
});
it('does not send telemetry in development', () => {
  Object.defineProperty(app, 'isPackaged', {
    value: false,
    configurable: true,
  });
  trackFeature('script_run');
  expect(mockCapture).not.toHaveBeenCalled();
  Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });
});

it('retains only managed bundle locations for bug grouping', () => {
  expect(
    safeErrorFrames(
      'TypeError: secret\n at /Users/private/project/main.js:42:9\n at https://private.example/site.js:8:2'
    )
  ).toEqual(['main.js:42:9']);
  expect(
    validatedErrorFrames([
      '/private/main.js:42:9',
      'renderer.js:99:3',
      'secret',
    ])
  ).toEqual(['renderer.js:99:3']);
});
