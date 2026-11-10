/** @jest-environment node */
/* eslint-disable global-require, no-script-url, no-restricted-syntax -- Tests use native SQLite fixtures and executable URL rejection cases. */
import { createCipheriv, createHash } from 'crypto';
import {
  bookmarkLinks,
  chromiumRoots,
  decodeChromiumCookie,
  migratedCookieDetails,
} from '../main/browserMigration';

const mockJournal = new Map();
jest.mock('../main/migrationJournal', () => ({
  saveMigrationJob: (record: any) =>
    mockJournal.set(record.token, JSON.parse(JSON.stringify(record))),
  loadMigrationJobs: () => [...mockJournal.values()],
  removeMigrationJob: (token: string) => mockJournal.delete(token),
}));
jest.mock('child_process', () => {
  const execFile = jest.fn(async () => ({ stdout: 'test-key', stderr: '' }));
  (execFile as any)[require('util').promisify.custom] = execFile;
  return { execFile };
});
jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  session: { fromPartition: jest.fn() },
}));
jest.mock('../main/history', () => ({ importBrowsingHistory: jest.fn() }));
test('reads nested bookmarks and filters executable and credential-bearing URLs', () => {
  const result = bookmarkLinks({
    roots: {
      bar: {
        type: 'folder',
        name: 'Work',
        children: [
          {
            type: 'folder',
            name: 'Tools',
            children: [
              { type: 'url', name: 'Docs', url: 'https://example.com' },
            ],
          },
          { type: 'url', url: 'javascript:alert(1)' },
          { type: 'url', url: 'https://user:pass@example.com' },
        ],
      },
    },
  });
  expect(result).toEqual([
    {
      url: 'https://example.com/',
      name: 'Docs',
      folderPath: ['Work', 'Tools'],
    },
  ]);
});
test('uses platform-specific browser profile roots', () => {
  expect(chromiumRoots('darwin', '/sample')[0].directory).toBe(
    '/sample/Library/Application Support/Google/Chrome'
  );
  expect(chromiumRoots('win32', '/sample', '/local')[0].directory).toBe(
    '/local/Google/Chrome/User Data'
  );
  expect(chromiumRoots('linux', '/sample')[0].directory).toBe(
    '/sample/.config/google-chrome'
  );
});
test('decrypts macOS Chromium cookies and rejects mismatched host binding', () => {
  const key = Buffer.alloc(16, 7);
  const host = '.example.com';
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 32));
  const plain = Buffer.concat([
    createHash('sha256').update(host).digest(),
    Buffer.from('cookie-value'),
  ]);
  const encrypted = Buffer.concat([
    Buffer.from('v10'),
    cipher.update(plain),
    cipher.final(),
  ]);
  expect(decodeChromiumCookie(encrypted, host, key, true)).toBe('cookie-value');
  expect(() =>
    decodeChromiumCookie(encrypted, '.other.com', key, true)
  ).toThrow();
  expect(() => decodeChromiumCookie(Buffer.from('v20bad'), host, key)).toThrow(
    'Unsupported'
  );
});

test('profile migration reads real SQLite history and requires a trusted, idempotent preview token', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { DatabaseSync } = await import('node:sqlite');
  const { ipcMain } = await import('electron');
  const { registerBrowserMigration } = await import('../main/browserMigration');
  const { importBrowsingHistory } = await import('../main/history');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-migration-test-'));
  const spy = jest.spyOn(require('os'), 'homedir').mockReturnValue(root);
  try {
    const directory = path.join(chromiumRoots()[0].directory, 'Default');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'Preferences'),
      JSON.stringify({ profile: { name: 'Sample profile' } })
    );
    fs.writeFileSync(
      path.join(directory, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bar: {
            type: 'folder',
            children: [
              { type: 'url', name: 'Docs', url: 'https://example.com' },
            ],
          },
        },
      })
    );
    const db = new DatabaseSync(path.join(directory, 'History'));
    db.exec('CREATE TABLE urls (url TEXT,title TEXT,last_visit_time INTEGER)');
    db.prepare('INSERT INTO urls VALUES (?,?,?)').run(
      'https://example.com',
      'Docs',
      (Date.now() - 10000 + 11644473600000) * 1000
    );
    db.close();
    const sender = { isDestroyed: () => false, mainFrame: {} };
    registerBrowserMigration((contents) => contents === sender);
    const handler = (ipcMain.handle as jest.Mock).mock.calls.at(-1)![1];
    await expect(
      handler(
        {
          sender: { isDestroyed: () => false, mainFrame: {} },
          senderFrame: {},
        },
        'profiles'
      )
    ).rejects.toThrow('Preferences');
    const event = { sender, senderFrame: sender.mainFrame };
    const found = await handler(event, 'profiles');
    expect(found[0].name).toBe('Sample profile');
    const preview = await handler(event, 'prepare', {
      destinationSpace: 'target',
      profileId: found[0].id,
      bookmarks: true,
      history: true,
      cookies: false,
    });
    expect(preview.profileId).toBe(`collection:target:${preview.token}`);
    expect(preview.links).toHaveLength(1);
    expect(preview.history).toBe(1);
    expect(preview).not.toHaveProperty('directory');
    (importBrowsingHistory as jest.Mock).mockClear();
    (importBrowsingHistory as jest.Mock)
      .mockRejectedValueOnce(new Error('History write interrupted'))
      .mockResolvedValue(1);
    await expect(
      handler(event, 'commit', { token: preview.token })
    ).rejects.toThrow('interrupted');
    (importBrowsingHistory as jest.Mock).mockClear();
    const commits = await Promise.all([
      handler(event, 'commit', { token: preview.token }),
      handler(event, 'commit', { token: preview.token }),
    ]);
    expect(commits).toEqual([
      { history: 1, cookies: 0, skippedCookies: 0 },
      { history: 1, cookies: 0, skippedCookies: 0 },
    ]);
    expect(await handler(event, 'commit', { token: preview.token })).toEqual({
      history: 1,
      cookies: 0,
      skippedCookies: 0,
    });
    expect(importBrowsingHistory).toHaveBeenCalledTimes(1);
    expect(
      await handler(event, 'status', { token: preview.token })
    ).toMatchObject({ stage: 'Import complete' });
    fs.writeFileSync(
      path.join(directory, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bar: {
            type: 'folder',
            children: Array.from({ length: 5001 }, (_, index) => ({
              type: 'url',
              name: `Page ${index}`,
              url: `https://example.com/${index}`,
            })),
          },
        },
      })
    );
    const next = await handler(event, 'prepare', {
      profileId: found[0].id,
      bookmarks: true,
      history: false,
      cookies: false,
    });
    expect(next.links).toHaveLength(5000);
    expect(next.warnings).toEqual([expect.stringContaining('5,000')]);
    sender.mainFrame = {};
    await expect(
      handler({ sender, senderFrame: sender.mainFrame }, 'commit', {
        token: next.token,
      })
    ).rejects.toThrow('Review');
  } finally {
    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cookie migration preserves host-only scope, HTTP-only and session expiry', () => {
  const row = {
    host_key: 'example.com',
    name: '__Host-login',
    path: '/',
    is_secure: 1n,
    is_httponly: 1n,
    samesite: 2n,
    has_expires: 0n,
    expires_utc: 0n,
  };
  const details = migratedCookieDetails(row, 'secret');
  expect(details.domain).toBeUndefined();
  expect(details.url).toBe('https://example.com/');
  expect(details.httpOnly).toBe(true);
  expect(details.expirationDate).toBeUndefined();
  expect(details.sameSite).toBe('strict');
  expect(
    migratedCookieDetails({ ...row, host_key: '.example.com' }, 'secret').domain
  ).toBe('.example.com');
});

test('reads a private snapshot of exclusively locked history and removes the temporary copy', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { DatabaseSync } = await import('node:sqlite');
  const { readMigrationDatabase } = await import('../main/browserMigration');
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-locked-history-test-')
  );
  const file = path.join(root, 'History');
  const db = new DatabaseSync(file);
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA locking_mode=EXCLUSIVE; CREATE TABLE urls (url TEXT,title TEXT,last_visit_time INTEGER); INSERT INTO urls VALUES ('https://example.com','Example',13300000000000000); BEGIN EXCLUSIVE; COMMIT;"
    );
    const before = fs.statSync(file).mtimeMs;
    const copies = fs
      .readdirSync(os.tmpdir())
      .filter((name) => name.startsWith('kudium-browser-import-'));
    const rows = await readMigrationDatabase(file, 'SELECT * FROM urls');
    expect(rows).toHaveLength(1);
    expect(rows[0].last_visit_time).toBe(13300000000000000n);
    expect(fs.statSync(file).mtimeMs).toBe(before);
    expect(
      fs
        .readdirSync(os.tmpdir())
        .filter((name) => name.startsWith('kudium-browser-import-'))
    ).toEqual(copies);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Arc discovery hides its system profile and prepares sidebar and standard bookmarks for the selected profile', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { ipcMain } = await import('electron');
  const { registerBrowserMigration } = await import('../main/browserMigration');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-arc-test-'));
  const spy = jest.spyOn(require('os'), 'homedir').mockReturnValue(root);
  try {
    const arc = chromiumRoots().find((p) => p.browser === 'Arc');
    if (!arc) return; // Arc native migration is macOS-only.
    for (const [directory, name] of [
      ['Default', 'Your Chromium'],
      ['Profile 1', '__ARC_SYSTEM_PROFILE'],
      ['Profile 2', 'Work'],
    ]) {
      fs.mkdirSync(path.join(arc.directory, directory), { recursive: true });
      fs.writeFileSync(
        path.join(arc.directory, directory, 'Preferences'),
        JSON.stringify({ profile: { name } })
      );
    }
    fs.writeFileSync(
      path.join(path.dirname(arc.directory), 'StorableSidebar.json'),
      JSON.stringify({
        sidebar: {
          containers: [
            {
              spaces: [
                'space',
                {
                  title: 'Work',
                  profile: { default: true },
                  containerIDs: ['pinned', 'root'],
                },
              ],
              items: [
                'root',
                { id: 'root', childrenIds: ['tab'] },
                'tab',
                {
                  id: 'tab',
                  data: { tab: { savedURL: 'https://example.com' } },
                },
              ],
            },
          ],
        },
      })
    );
    fs.writeFileSync(
      path.join(arc.directory, 'Profile 2', 'Bookmarks'),
      JSON.stringify({
        roots: {
          bar: { type: 'url', url: 'https://other.example', name: 'Other' },
        },
      })
    );
    const sender: any = { isDestroyed: () => false, mainFrame: {} };
    registerBrowserMigration(() => true);
    const handler = (ipcMain.handle as jest.Mock).mock.calls.at(-1)[1];
    const event = { sender, senderFrame: sender.mainFrame };
    const found = await handler(event, 'profiles');
    expect(found.map((p: any) => p.name)).toEqual([
      'Default profile',
      'Work (Profile 2)',
    ]);
    expect(found.every((p: any) => p.bookmarks)).toBe(true);
    const first = await handler(event, 'prepare', {
      profileId: found[0].id,
      bookmarks: true,
      history: false,
      cookies: false,
    });
    expect(first.links[0].spaceName).toBe('Work');
    const second = await handler(event, 'prepare', {
      profileId: found[1].id,
      bookmarks: true,
      history: false,
      cookies: false,
    });
    expect(second.links.map((l: any) => l.url)).toEqual([
      'https://other.example/',
    ]);
  } finally {
    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cookie snapshot reads rows and metadata together without blocking the main thread', async () => {
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const { DatabaseSync } = await import('node:sqlite');
  const { readCookieSnapshot } = await import('../main/migrationDatabase');
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-cookie-snapshot-test-')
  );
  const file = path.join(root, 'Cookies');
  const db = new DatabaseSync(file);
  try {
    db.exec(
      "CREATE TABLE meta (key TEXT,value INTEGER); INSERT INTO meta VALUES ('version',24); CREATE TABLE cookies (host_key TEXT,name TEXT,value TEXT,encrypted_value BLOB,path TEXT,expires_utc INTEGER,is_secure INTEGER,is_httponly INTEGER,samesite INTEGER,has_expires INTEGER,top_frame_site_key TEXT)"
    );
    const insert = db.prepare(
      "INSERT INTO cookies VALUES ('example.com',?,'value',NULL,'/',0,1,1,1,0,'')"
    );
    db.exec('BEGIN');
    for (let index = 0; index < 10001; index += 1)
      insert.run(`cookie-${index}`);
    db.exec('COMMIT');
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 0);
    const result = await readCookieSnapshot(file);
    clearTimeout(timer);
    expect(ticked).toBe(true);
    expect(result.total).toBe(10001);
    expect(result.rows).toHaveLength(10000);
    expect(result.hostBound).toBe(true);
    expect(result.rows[0].is_httponly).toBe(1n);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cookie writes are bounded, report progress, and permit retries of failed writes', async () => {
  const { session } = await import('electron');
  const { transferCookies } = await import('../main/browserMigration');
  let active = 0;
  let peak = 0;
  const set = jest.fn(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });
    active -= 1;
    if (set.mock.calls.length === 8) throw new Error('Temporary write failure');
  });
  const flushStore = jest.fn(async () => {});
  (session.fromPartition as jest.Mock).mockReturnValue({
    cookies: { set, flushStore },
  });
  const snapshot = {
    total: 10001,
    hostBound: false,
    rows: Array.from({ length: 24 }, (_, index) => ({
      host_key: 'example.com',
      name: `cookie-${index}`,
      value: 'value',
      path: '/',
      is_secure: 1,
      is_httponly: 1,
      has_expires: 0,
    })),
  };
  const progress = jest.fn();
  const source = { directory: '/missing', keychain: 'test' } as any;
  const result = await transferCookies(
    source,
    'shared',
    () => {},
    progress,
    snapshot
  );
  expect(peak).toBe(8);
  expect(result.retryable).toBe(true);
  expect(flushStore).toHaveBeenCalledTimes(1);
  expect(progress).toHaveBeenLastCalledWith('Transferring cookies', 24, 24);
  set.mockImplementation(async () => {});
  const retry = await transferCookies(
    source,
    'shared',
    () => {},
    progress,
    snapshot
  );
  expect(retry.cookies).toBe(24);
  expect(retry.retryable).toBeUndefined();
  expect(session.fromPartition).toHaveBeenLastCalledWith(
    'persist:kudiumbrowser-shared'
  );
});

test('recovers an interrupted import in a new renderer using its original login profile', async () => {
  const { ipcMain } = await import('electron');
  const { registerBrowserMigration } = await import('../main/browserMigration');
  const { importBrowsingHistory } = await import('../main/history');
  const token = '00000000-0000-4000-8000-000000000001';
  mockJournal.clear();
  mockJournal.set(token, {
    token,
    created: 1,
    profileId: 'original-shared-profile',
    source: {
      id: 'source',
      directory: '/source',
      browser: 'Chrome',
      name: 'Default',
      cookies: false,
    },
    links: [{ name: 'Page', url: 'https://example.com' }],
    history: [],
    cookies: false,
    destinationSpace: 'destination',
    organization: { foldersAsGroups: true, spacesAsFolders: false },
  });
  const sender = { isDestroyed: () => false, mainFrame: {} };
  registerBrowserMigration((contents) => contents === sender);
  const handler = (ipcMain.handle as jest.Mock).mock.calls.at(-1)![1];
  const event = { sender, senderFrame: sender.mainFrame };
  const recovered = await handler(event, 'recover');
  expect(recovered[0]).toMatchObject({
    token,
    profileId: 'original-shared-profile',
    destinationSpace: 'destination',
  });
  expect(recovered[0].source).not.toHaveProperty('directory');
  (importBrowsingHistory as jest.Mock).mockResolvedValueOnce(0);
  await handler(event, 'commit', { token });
  expect(importBrowsingHistory).toHaveBeenLastCalledWith(
    [],
    'original-shared-profile'
  );
  expect(mockJournal.has(token)).toBe(false);
});
