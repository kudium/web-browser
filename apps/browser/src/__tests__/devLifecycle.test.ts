/* eslint-disable global-require */
import { EventEmitter } from 'events';
import { isCancelledAssetResponse } from '../../.erb/scripts/devLogging';

jest.mock('electron', () => '/electron');
jest.mock('detect-port', () => jest.fn(async (port) => port));
jest.mock('../../.erb/configs/webpack.config.main.dev', () => ({}));
jest.mock('../../.erb/configs/webpack.config.preload.dev', () => ({}));
jest.mock('../../.erb/configs/webpack.config.renderer.dev', () => ({}));
jest.mock('webpack', () => jest.fn());
jest.mock('webpack-dev-server', () => jest.fn());
jest.mock('child_process', () => ({ spawn: jest.fn() }));

function compiler() {
  const callbacks: Record<string, (...args: any[]) => any> = {};
  return {
    callbacks,
    hooks: Object.fromEntries(
      ['done', 'failed', 'invalid', 'infrastructureLog'].map((name) => [
        name,
        {
          tap: (_label: string, callback: (...args: any[]) => any) => {
            callbacks[name] = callback;
          },
        },
      ])
    ),
    watch: jest.fn((_options, callback) => {
      callbacks.build = callback;
    }),
    close: jest.fn((callback) => callback()),
  };
}

test('restarts Electron after successful main builds and leaves renderer updates to HMR', async () => {
  jest.useFakeTimers();
  const listeners = (['SIGINT', 'SIGTERM'] as const).map((signal) =>
    process.listeners(signal)
  );
  const webpack = require('webpack');
  const { spawn } = require('child_process');
  const DevServer = require('webpack-dev-server');
  const compilers = [compiler(), compiler(), compiler()];
  compilers.forEach((value) => webpack.mockReturnValueOnce(value));
  DevServer.mockImplementation(() => ({
    start: async () => {},
    stop: async () => {},
  }));
  spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: jest.fn(() => {
        child.emit('exit', 0, null);
        return true;
      }),
    });
    return child;
  });
  try {
    require('../../.erb/scripts/dev');
    await Promise.resolve();
    await Promise.resolve();
    const good = { hasErrors: () => false };
    compilers[0].callbacks.build(null, good);
    compilers[1].callbacks.build(null, good);
    expect(spawn).not.toHaveBeenCalled();
    compilers[2].callbacks.done(good);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1][0]).toBe('.erb/dll/main.js');
    compilers[2].callbacks.invalid();
    compilers[2].callbacks.done(good);
    await jest.advanceTimersByTimeAsync(200);
    expect(spawn).toHaveBeenCalledTimes(1);
    compilers[0].callbacks.invalid();
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    compilers[0].callbacks.build(null, {
      hasErrors: () => true,
      toString: () => 'Build failed',
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(spawn).toHaveBeenCalledTimes(1);
    errorLog.mockRestore();
    compilers[0].callbacks.build(null, good);
    await jest.advanceTimersByTimeAsync(200);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.results[0].value.kill).toHaveBeenCalledWith('SIGINT');
  } finally {
    (['SIGINT', 'SIGTERM'] as const).forEach((signal, index) => {
      process.listeners(signal).forEach((listener) => {
        if (!listeners[index].includes(listener))
          process.removeListener(signal, listener);
      });
    });
    jest.useRealTimers();
  }
});

test('ignores only cancelled middleware responses and preserves other diagnostics', () => {
  const args = ['Stream error:', { code: 'ERR_STREAM_PREMATURE_CLOSE' }];
  expect(
    isCancelledAssetResponse('webpack-dev-middleware', 'error', args)
  ).toBe(true);
  expect(isCancelledAssetResponse('another-plugin', 'error', args)).toBe(false);
  expect(
    isCancelledAssetResponse('webpack-dev-middleware', 'error', [
      'Stream error:',
      { code: 'EIO' },
    ])
  ).toBe(false);
  expect(
    isCancelledAssetResponse('webpack-dev-middleware', 'error', [
      'Build failed',
      args[1],
    ])
  ).toBe(false);
});
