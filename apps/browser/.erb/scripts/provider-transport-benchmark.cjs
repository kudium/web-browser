/* Synthetic local requests only; never use a real provider key or user profile. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const esbuild = require('esbuild');

async function run() {
  const phase = process.argv[2];
  if (!['before', 'after'].includes(phase))
    throw new Error('Expected before or after');
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-provider-')
  );
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({
      path: request.url,
      fakeAuthorization:
        request.headers.authorization === 'Bearer synthetic-test-key',
    });
    if (request.url === '/redirect') {
      response.writeHead(307, { Location: '/destination' });
      response.end();
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/redirect`;
    const entry = path.join(temporary, 'provider.cjs');
    esbuild.buildSync({
      entryPoints: ['src/main/aiProviderRequest.ts'],
      bundle: true,
      platform: 'node',
      outfile: entry,
    });
    const browser = path.join(temporary, 'url.cjs');
    esbuild.buildSync({
      entryPoints: ['src/browser/ai.ts'],
      bundle: true,
      platform: 'node',
      outfile: browser,
    });
    const exports = require(browser);
    const validate = exports.aiProviderURL || exports.aiURL;
    let remotePlaintextAccepted = false;
    try {
      validate('http://provider.example/v1');
      remotePlaintextAccepted = true;
    } catch {}
    let redirectAccepted = false;
    let error;
    try {
      await require(entry).requestAIProvider(
        url,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic-test-key' },
          body: '{"synthetic":true}',
        },
        new AbortController().signal,
        () => {},
        5000
      );
      redirectAccepted = true;
    } catch (reason) {
      error = reason.message;
    }
    const sources = ['src/main/aiProviderRequest.ts', 'src/browser/ai.ts'];
    const result = {
      measuredAt: new Date().toISOString(),
      runtime: process.version,
      platform: `${process.platform}/${process.arch}`,
      method:
        'Actual bundled requestAIProvider against a loopback HTTP fixture returning a 307 redirect; synthetic credentials and body. Remote HTTP is tested by URL validation without network access.',
      sourceSHA256: Object.fromEntries(
        sources.map((file) => [
          file,
          crypto
            .createHash('sha256')
            .update(fs.readFileSync(file))
            .digest('hex'),
        ])
      ),
      remotePlaintextAccepted,
      redirectAccepted,
      outgoingRequests: requests.length,
      redirectedRequestsWithCredential: requests.filter(
        (request) =>
          request.path === '/destination' && request.fakeAuthorization
      ).length,
      requests,
      error,
      limitations: [
        'Tests provider transport policy, not the whole application or TLS implementation.',
        'Request-count reduction applies to rejected redirects, not ordinary inference latency.',
      ],
    };
    const filename = 'docs/benchmarks/provider-transport.json';
    const report = fs.existsSync(filename)
      ? JSON.parse(fs.readFileSync(filename, 'utf8'))
      : {};
    if (report[phase])
      throw new Error(`Refusing to overwrite ${phase} evidence`);
    report[phase] = result;
    fs.writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
