// Controlled native cookie transfer, Keychain, and restart-recovery regression.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-import-native-'));
  const service = `Kudium Import Test ${crypto.randomUUID()}`;
  try {
    require('esbuild').buildSync({
      stdin: {
        contents: [
          "export {transferCookies} from './src/main/browserMigration';",
          "export {saveMigrationJob, loadMigrationJobs} from './src/main/migrationJournal';",
          "export {initializeLocalStorage} from './src/main/localStorage';",
          "export {loginProfileKey} from './src/utils/groups';",
        ].join('\n'),
        resolveDir: path.join(__dirname, '../..'),
      },
      bundle: true,
      platform: 'node',
      outfile: path.join(root, 'modules.cjs'),
      external: ['electron'],
    });
    execFileSync(
      '/usr/bin/security',
      [
        'add-generic-password',
        '-a',
        'kudium-import-test',
        '-s',
        service,
        '-w',
        'fixture-key',
        '-T',
        '/usr/bin/security',
      ],
      { timeout: 10000, stdio: 'pipe' }
    );
    for (const phase of ['save', 'restart'])
      execFileSync(require('electron'), [__filename, phase], {
        env: {
          ...process.env,
          KUDIUM_IMPORT_TEST_ROOT: root,
          KUDIUM_IMPORT_TEST_SERVICE: service,
        },
        timeout: 60000,
        stdio: 'inherit',
      });
    console.log(
      'PASS: native Keychain cookie transfer, shared groups, isolated profiles, and encrypted recovery after restart'
    );
  } finally {
    try {
      execFileSync(
        '/usr/bin/security',
        ['delete-generic-password', '-s', service],
        { timeout: 10000, stdio: 'pipe' }
      );
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow, session } = require('electron');
  const http = require('http');
  const root = process.env.KUDIUM_IMPORT_TEST_ROOT;
  app.setPath('userData', root);
  app.on('window-all-closed', () => {});
  const modules = require(path.join(root, 'modules.cjs'));
  (async () => {
    await app.whenReady();
    const { initializeLocalStorage } = modules;
    await initializeLocalStorage();
    const { saveMigrationJob, loadMigrationJobs } = modules;
    const { transferCookies } = modules;
    const { loginProfileKey } = require(path.join(root, 'modules.cjs'));
    const token = '00000000-0000-4000-8000-000000000001';
    if (process.argv.includes('save')) {
      const { DatabaseSync } = require('node:sqlite');
      const source = path.join(root, 'source');
      fs.mkdirSync(source);
      const db = new DatabaseSync(path.join(source, 'Cookies'));
      db.exec(
        "CREATE TABLE meta (key TEXT,value INTEGER); INSERT INTO meta VALUES ('version',24); CREATE TABLE cookies (host_key TEXT,name TEXT,value TEXT,encrypted_value BLOB,path TEXT,expires_utc INTEGER,is_secure INTEGER,is_httponly INTEGER,samesite INTEGER,has_expires INTEGER)"
      );
      const key = crypto.pbkdf2Sync(
        'fixture-key',
        'saltysalt',
        1003,
        16,
        'sha1'
      );
      const cipher = crypto.createCipheriv(
        'aes-128-cbc',
        key,
        Buffer.alloc(16, 32)
      );
      const plain = Buffer.concat([
        crypto.createHash('sha256').update('127.0.0.1').digest(),
        Buffer.from('fixture-session'),
      ]);
      const encrypted = Buffer.concat([
        Buffer.from('v10'),
        cipher.update(plain),
        cipher.final(),
      ]);
      db.prepare('INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?,?)').run(
        '127.0.0.1',
        'import-login',
        '',
        encrypted,
        '/',
        BigInt((Date.now() + 3600000) * 1000) + 11644473600000000n,
        0,
        1,
        1,
        1
      );
      db.close();
      key.fill(0);
      const result = await transferCookies(
        { directory: source, keychain: process.env.KUDIUM_IMPORT_TEST_SERVICE },
        'shared-import',
        () => {},
        () => {}
      );
      assert.strictEqual(result.cookies, 1);
      saveMigrationJob({
        token,
        profileId: 'shared-import',
        links: [{ name: 'Fixture', url: 'https://fixture.invalid' }],
        history: [],
        cookies: true,
        destinationSpace: 'target',
      });
      const file = fs.readFileSync(
        path.join(root, 'browser-imports', `${token}.json`),
        'utf8'
      );
      assert(
        !file.includes('fixture.invalid'),
        'Recovery URLs must be encrypted'
      );
    } else {
      assert.strictEqual(loadMigrationJobs()[0].profileId, 'shared-import');
    }
    const server = http.createServer((req, res) =>
      res.end(
        req.headers.cookie?.includes('import-login=fixture-session')
          ? 'Signed in'
          : 'Signed out'
      )
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      for (const sessionId of ['group-one', 'group-two']) {
        const profile = session.fromPartition(
          `persist:kudiumbrowser-${loginProfileKey({
            sessionId,
            sessionProfileId: 'shared-import',
          })}`
        );
        const window = new BrowserWindow({
          show: false,
          webPreferences: { session: profile, sandbox: true },
        });
        await window.loadURL(
          `http://127.0.0.1:${server.address().port}/account`
        );
        assert.strictEqual(
          await window.webContents.executeJavaScript(
            'document.body.textContent'
          ),
          'Signed in'
        );
        window.destroy();
      }
      assert.deepStrictEqual(
        await session
          .fromPartition('persist:kudiumbrowser-unrelated')
          .cookies.get({ name: 'import-login' }),
        []
      );
      await session
        .fromPartition('persist:kudiumbrowser-shared-import')
        .cookies.flushStore();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    app.exit(0);
  })().catch((error) => {
    console.error(error);
    app.exit(1);
  });
}
