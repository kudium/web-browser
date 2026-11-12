/* Isolated module loads verify restart recovery against persisted state. */
/* eslint-disable global-require */
/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import {
  getSiteSettings,
  saveSiteHooks,
  markHooksWorking,
} from '../main/siteSettings';
import { emptyDeveloperConfig } from '../browser/siteDeveloper';

jest.mock('electron', () => ({ app: { getPath: jest.fn() } }));

it('keeps successful source across a broken save and restart, with bounded history', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-hook-history-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  try {
    const working = {
      ...emptyDeveloperConfig,
      enabled: true,
      after: "log('working')",
    };
    saveSiteHooks('profile', 'https://example.com', working, () => {});
    markHooksWorking('profile', 'https://example.com', working, '');
    saveSiteHooks(
      'profile',
      'https://example.com',
      { ...working, after: 'broken()' },
      () => {}
    );
    const persisted = JSON.parse(
      fs.readFileSync(path.join(directory, 'site-settings.json'), 'utf8')
    );
    expect(
      persisted['["profile","https://example.com"]'].hookRevisions.some(
        (entry: any) =>
          entry.config.after === working.after &&
          entry.workingHooks.includes('')
      )
    ).toBe(true);
    jest.isolateModules(() => {
      const electron = require('electron');
      electron.app.getPath.mockReturnValue(directory);
      const settings = require('../main/siteSettings');
      expect(
        settings
          .getSiteSettings('profile', 'https://example.com')
          .hookRevisions.some(
            (entry: any) =>
              entry.config.after === working.after &&
              entry.workingHooks.includes('')
          )
      ).toBe(true);
    });
    Array.from({ length: 15 }).forEach((_, index) =>
      saveSiteHooks(
        'profile',
        'https://example.com',
        { ...working, after: `log(${index})` },
        () => {}
      )
    );
    expect(
      getSiteSettings('profile', 'https://example.com').hookRevisions!.length
    ).toBeLessThanOrEqual(11);
    expect(
      getSiteSettings('profile', 'https://example.com').hookRevisions!.some(
        (entry) =>
          entry.config.after === working.after &&
          entry.workingHooks?.includes('')
      )
    ).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('never starts execution or exposes a draft when durable saving fails', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-hook-atomic-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  const run = jest.fn();
  let rename: jest.SpyInstance | undefined;
  try {
    saveSiteHooks(
      'profile',
      'https://example.com',
      emptyDeveloperConfig,
      () => {}
    );
    rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('disk failure');
    });
    expect(() =>
      saveSiteHooks(
        'profile',
        'https://example.com',
        { ...emptyDeveloperConfig, enabled: true, after: 'log(1)' },
        run
      )
    ).toThrow('disk failure');
    expect(run).not.toHaveBeenCalled();
    expect(getSiteSettings('profile', 'https://example.com').developer).toEqual(
      emptyDeveloperConfig
    );
  } finally {
    rename?.mockRestore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
