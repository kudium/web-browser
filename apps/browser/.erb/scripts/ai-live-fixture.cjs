/* Static, disposable localhost page for live AI evaluation. No user data. */
const http = require('http');
const page = `<!doctype html><title>Kudium AI evaluation</title>
<style>body{font:16px system-ui;margin:32px;max-width:780px}input,button{font:inherit;padding:8px}article{margin-top:40px}</style>
<h1>Kudium AI evaluation</h1><p>This is a disposable local test page.</p>
<label for="name">Name</label><input id="name"><button id="apply" onclick="document.querySelector('#status').textContent='Done '+document.querySelector('#name').value">Apply</button><p id="status">Ready</p>
<article><h2>Release notes</h2>${Array.from(
  { length: 700 },
  (_, i) =>
    `<p>Section ${i + 1}. Background paragraph for long-page evaluation.</p>`
).join('')}<p>Release code: KUDIUM-TAIL-7391</p></article>`;
const server = http.createServer((request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(page);
});
server.listen(0, '127.0.0.1', () =>
  console.log(`http://127.0.0.1:${server.address().port}/fixture`)
);
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
