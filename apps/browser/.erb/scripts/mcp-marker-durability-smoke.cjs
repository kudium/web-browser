/* Filesystem fault probe; real MCP controller, disposable synthetic settings. */
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert/strict'),
  crypto = require('crypto');
const root = path.resolve(__dirname, '../..'),
  phase = process.argv[2] || 'after';
assert(['before', 'after'].includes(phase));
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'touchbox-mcp-marker-')
);
const source = (file) =>
  fs.readFileSync(
    path.join(
      root,
      phase === 'before'
        ? `docs/benchmarks/baselines/mcp-marker-durability/${path.basename(
            file
          )}.txt`
        : file
    )
  );
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  const bundle = path.join(temporary, 'mcp.cjs');
  await require('esbuild').build({
    stdin: {
      contents: source('src/main/mcp.ts').toString(),
      loader: 'ts',
      resolveDir: path.join(root, 'src/main'),
    },
    bundle: true,
    platform: 'node',
    outfile: bundle,
    plugins: [
      {
        name: 'retained-private-file',
        setup(build) {
          build.onLoad({ filter: /\/src\/main\/privateFile\.ts$/ }, () => ({
            contents: source('src/main/privateFile.ts').toString(),
            loader: 'ts',
          }));
        },
      },
    ],
  });
  const { createMCPController } = require(bundle),
    filename = path.join(temporary, 'settings.json');
  const create = () =>
    createMCPController({
      filename,
      execute: async () => null,
      stop: () => {},
      changed: () => {},
    });
  let controller = create();
  await controller.ready;
  const originalSync = fs.fsyncSync,
    originalRename = fs.renameSync;
  const trace = [];
  let failDirectory = true;
  fs.fsyncSync = (fd) => {
    const kind = fs.fstatSync(fd).isDirectory() ? 'directory' : 'file';
    trace.push(`sync:${kind}`);
    if (kind === 'directory' && failDirectory)
      throw new Error('Injected directory-sync failure');
    return originalSync(fd);
  };
  fs.renameSync = (...args) => {
    trace.push('rename');
    return originalRename(...args);
  };
  const results = [];
  const attempt = (name) => {
    trace.length = 0;
    let returned = false,
      error;
    try {
      controller.markPrivateDataDisclosed();
      returned = true;
    } catch (value) {
      error = value.message;
    }
    results.push({
      name,
      returned,
      error,
      trace: [...trace],
      runtimePrivate: controller.privateDataDisclosed(),
      diskPrivate: JSON.parse(fs.readFileSync(filename)).privateDataDisclosed,
    });
  };
  try {
    attempt('first disclosure with directory-sync failure');
    await controller.dispose();
    controller = create();
    await controller.ready;
    attempt('restart with directory-sync failure');
    failDirectory = false;
    attempt('successful retry');
    attempt('repeated acknowledged marker');
    for (const result of results.slice(0, 2)) {
      assert.equal(result.returned, phase === 'before');
      assert(result.runtimePrivate && result.diskPrivate);
    }
    assert(results[2].returned && results[3].returned);
    if (phase === 'after')
      assert.deepEqual(results[2].trace, [
        'sync:file',
        'rename',
        'sync:directory',
      ]);
    assert.equal(results[3].trace.length, 0);
    const output = path.join(
      root,
      'docs/benchmarks/mcp-marker-durability.json'
    );
    const report = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output))
      : {};
    report[phase] = {
      platform: process.platform,
      probeSha256: hash(fs.readFileSync(__filename)),
      sourceHashes: Object.fromEntries(
        ['src/main/mcp.ts', 'src/main/privateFile.ts'].map((file) => [
          file,
          hash(source(file)),
        ])
      ),
      results,
      scope:
        'Actual bundled MCP controller and filesystem operations. Injected directory fsync error after rename. Returned means markPrivateDataDisclosed returned, the prerequisite used by ai.ts before returning approved facts. No actual private facts, provider/RPC traffic, physical power-loss or Windows/Linux filesystem verification.',
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(
      'PASS ' +
        phase +
        ': marker durability ordering, post-rename failure, restart, retry and cached acknowledgement.'
    );
  } finally {
    fs.fsyncSync = originalSync;
    fs.renameSync = originalRename;
    await controller.dispose();
  }
})()
  .then(() => {
    fs.rmSync(temporary, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
