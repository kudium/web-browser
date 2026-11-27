#!/usr/bin/env node
// Dependency-free fixture server for agent benchmarks and traces. Disposable local pages only.
// Usage: node server.cjs [port]   (0 picks a free port; the chosen URL is printed)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const items = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  price: (i + 1) * 3,
}));

function serveFile(request, response, pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.normalize(path.join(root, relative));
  if (!file.startsWith(root + path.sep) || file.endsWith('.cjs')) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(data);
  });
}

function handle(request, response) {
  const url = new URL(request.url, 'http://fixture.local');
  if (url.pathname === '/api/items') {
    response.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(items));
    return;
  }
  if (url.pathname === '/slow') {
    const ms = Math.min(30000, Math.max(0, Number(url.searchParams.get('ms')) || 1000));
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': types['.html'] });
      response.end(`<!doctype html><title>Slow</title><h1>Slow page</h1><p>Waited ${ms} ms.</p>`);
    }, ms);
    return;
  }
  if (url.pathname === '/login' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) request.destroy();
    });
    request.on('end', () => {
      const user = new URLSearchParams(body).get('username') || 'guest';
      response.writeHead(303, {
        Location: '/dashboard.html',
        'Set-Cookie': `fixture_user=${encodeURIComponent(user)}; Path=/; SameSite=Lax`,
      });
      response.end();
    });
    return;
  }
  serveFile(request, response, url.pathname);
}

// Minimal RFC 6455 server: accept the handshake, keep the socket open, echo text frames.
function upgrade(request, socket) {
  if (request.url !== '/ws' || String(request.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const frame = (text) => {
    const payload = Buffer.from(text);
    const header =
      payload.length < 126
        ? Buffer.from([0x81, payload.length])
        : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
    return Buffer.concat([header, payload]);
  };
  socket.write(frame('hello'));
  const ping = setInterval(() => {
    if (!socket.destroyed) socket.write(frame(`tick ${Date.now()}`));
  }, 1000);
  socket.on('data', (data) => {
    // Client frames are masked; decode short text frames and echo them.
    if ((data[0] & 0x0f) === 0x8) {
      socket.end();
      return;
    }
    if ((data[0] & 0x0f) !== 0x1 || (data[1] & 0x7f) >= 126) return;
    const length = data[1] & 0x7f;
    const mask = data.subarray(2, 6);
    const text = Buffer.from(data.subarray(6, 6 + length).map((byte, i) => byte ^ mask[i % 4])).toString();
    socket.write(frame(`echo ${text}`));
  });
  socket.on('close', () => clearInterval(ping));
  socket.on('error', () => clearInterval(ping));
}

function start(port = 0, host = '127.0.0.1') {
  const server = http.createServer(handle);
  server.on('upgrade', upgrade);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

module.exports = { start, handle };

if (require.main === module) {
  start(Number(process.argv[2]) || 0)
    .then((server) => {
      console.log(`http://127.0.0.1:${server.address().port}/`);
      const stop = () => server.close(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      return undefined;
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
