import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import {
  getSiteSettings,
  updateSiteSettings,
  siteOrigin,
} from '../main/siteSettings';

jest.mock('electron', () => ({ app: { getPath: jest.fn() } }));
it('persists site decisions, permits reversing a denial, and isolates profiles and origins', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-site-settings-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  try {
    updateSiteSettings('work', 'https://example.com', {
      permissions: { geolocation: 'block' },
      muted: true,
    });
    expect(
      getSiteSettings('work', 'https://example.com').permissions.geolocation
    ).toBe('block');
    updateSiteSettings('work', 'https://example.com', {
      permissions: { geolocation: 'allow' },
    });
    expect(getSiteSettings('work', 'https://example.com')).toEqual({
      permissions: { geolocation: 'allow' },
      muted: true,
      adBlocking: true,
    });
    expect(
      getSiteSettings('personal', 'https://example.com').permissions
    ).toEqual({});
    expect(getSiteSettings('work', 'http://example.com').permissions).toEqual(
      {}
    );
    expect(getSiteSettings('work', 'https://example.com:8443').muted).toBe(
      false
    );
    updateSiteSettings('work', 'https://example.com', { permissions: {} });
    expect(getSiteSettings('work', 'https://example.com')).toEqual({
      permissions: {},
      muted: true,
      adBlocking: true,
    });
    updateSiteSettings('work', 'https://example.com', { adBlocking: false });
    expect(getSiteSettings('work', 'https://example.com').adBlocking).toBe(false);
    expect(getSiteSettings('personal', 'https://example.com').adBlocking).not.toBe(false);
    updateSiteSettings('work', 'https://example.com', { adBlocking: true });
    expect(getSiteSettings('work', 'https://example.com').adBlocking).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
it('normalizes website origins and rejects non-website schemes', () => {
  expect(siteOrigin('https://example.com/path')).toBe('https://example.com');
  expect(siteOrigin('https://example.com:8443')).toBe(
    'https://example.com:8443'
  );
  expect(siteOrigin('file:///tmp/site.html')).toBeUndefined();
  expect(siteOrigin('invalid')).toBeUndefined();
});

it('reads settings once, protects cached grants from callers, and retains state when saving fails', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-site-cache-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  const file = path.join(directory, 'site-settings.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      '["work","https://example.com"]': {
        permissions: { geolocation: 'block' },
        muted: false,
      },
    })
  );
  const read = jest.spyOn(fs, 'readFileSync');
  try {
    Array.from({ length: 1000 }).forEach(() => {
      expect(
        getSiteSettings('work', 'https://example.com').permissions.geolocation
      ).toBe('block');
    });
    expect(
      read.mock.calls.filter(([filename]) => filename === file)
    ).toHaveLength(1);
    getSiteSettings('work', 'https://example.com').permissions.geolocation =
      'allow';
    expect(
      getSiteSettings('work', 'https://example.com').permissions.geolocation
    ).toBe('block');
    const rename = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('Disk full');
    });
    expect(() =>
      updateSiteSettings('work', 'https://example.com', {
        permissions: { geolocation: 'allow' },
      })
    ).toThrow('Disk full');
    rename.mockRestore();
    expect(
      getSiteSettings('work', 'https://example.com').permissions.geolocation
    ).toBe('block');
    updateSiteSettings('work', 'https://example.com', {
      permissions: { geolocation: 'allow' },
    });
    expect(
      getSiteSettings('work', 'https://example.com').permissions.geolocation
    ).toBe('allow');
  } finally {
    read.mockRestore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('ignores malformed grants instead of treating them as permissions', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-site-invalid-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  try {
    fs.writeFileSync(
      path.join(directory, 'site-settings.json'),
      JSON.stringify({
        '["work","https://example.com"]': {
          permissions: {
            media: true,
            geolocation: 'allow',
            notifications: 'yes',
          },
          muted: 'true',
        },
        '["work","https://other.example"]': null,
      })
    );
    expect(getSiteSettings('work', 'https://example.com')).toEqual({
      permissions: { geolocation: 'allow' },
      muted: false,
      adBlocking: true,
    });
    expect(getSiteSettings('work', 'https://other.example')).toEqual({
      permissions: {},
      muted: false,
      adBlocking: true,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('blocks malformed site hook code and preserves the saved settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-site-syntax-'));
  (app.getPath as jest.Mock).mockReturnValue(directory);
  updateSiteSettings('syntax-profile', 'https://example.com', { developer: { enabled: true, before: '', after: 'log("valid")', css: '' } });
  expect(() => updateSiteSettings('syntax-profile', 'https://example.com', { developer: { enabled: true, before: '', after: 'const broken = ;', css: '' } })).toThrow('After load, line 1');
  expect(getSiteSettings('syntax-profile', 'https://example.com').developer?.after).toBe('log("valid")');
  fs.rmSync(directory, { recursive: true, force: true });
});

it('keeps private site decisions in memory without creating a settings file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-private-settings-'));
  (app.getPath as jest.Mock).mockReturnValue(directory);
  updateSiteSettings('private:fixture:profile', 'https://private.example', { permissions: { geolocation: 'allow' }, muted: true });
  expect(getSiteSettings('private:fixture:profile', 'https://private.example').permissions.geolocation).toBe('allow');
  expect(fs.existsSync(path.join(directory, 'site-settings.json'))).toBe(false);
  fs.rmdirSync(directory);
});
