/** @jest-environment node */
import http from 'http';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const { start } = require(path.resolve(__dirname, '../../../demo/fixture/server.cjs'));

const get = (url: string) =>
  new Promise<{ status: number; type: string; body: string; headers: http.IncomingHttpHeaders }>(
    (resolve, reject) => {
      http
        .get(url, (response) => {
          let body = '';
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () =>
            resolve({
              status: response.statusCode || 0,
              type: String(response.headers['content-type']),
              body,
              headers: response.headers,
            })
          );
        })
        .on('error', reject);
    }
  );

let server: http.Server;
let origin: string;
beforeAll(async () => {
  server = await start(0);
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

it('serves every fixture page', async () => {
  for (const page of [
    '/',
    '/login.html',
    '/dashboard.html',
    '/settings.html',
    '/editor.html',
    '/frame.html',
    '/list.html',
    '/spa/',
    '/spa/app.js',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const result = await get(origin + page);
    expect([page, result.status]).toEqual([page, 200]);
  }
  const home = await get(`${origin}/`);
  expect(home.type).toContain('text/html');
  expect(home.body).toContain('Kudium fixture');
});

it('answers the JSON API and refuses paths outside the folder', async () => {
  const api = await get(`${origin}/api/items`);
  expect(api.type).toContain('application/json');
  expect(JSON.parse(api.body)).toHaveLength(25);
  expect((await get(`${origin}/../package.json`)).status).toBe(404);
  expect((await get(`${origin}/server.cjs`)).status).toBe(404);
});

it('signs in with a cookie redirect', async () => {
  const result = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const request = http.request(
      `${origin}/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      resolve
    );
    request.on('error', reject);
    request.end('username=sam&password=x');
  });
  expect(result.statusCode).toBe(303);
  expect(result.headers.location).toBe('/dashboard.html');
  expect(String(result.headers['set-cookie'])).toContain('fixture_user=sam');
  result.resume();
});

it('completes a WebSocket handshake for the SPA', async () => {
  const status = await new Promise<number>((resolve, reject) => {
    const request = http.request(`${origin}/ws`, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });
    request.on('upgrade', (response, socket) => {
      expect(response.headers['sec-websocket-accept']).toBe(
        's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
      );
      socket.destroy();
      resolve(response.statusCode || 0);
    });
    request.on('error', reject);
    request.end();
  });
  expect(status).toBe(101);
});
