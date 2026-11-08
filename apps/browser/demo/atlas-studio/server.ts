const routes = new Set([
  'brief',
  'research',
  'accessibility',
  'journal',
  'reading',
]);
Bun.serve({
  hostname: '127.0.0.1',
  port: 4178,
  async fetch(request) {
    const route = new URL(request.url).pathname.slice(1);
    const filename = routes.has(route) ? `${route}.html` : 'index.html';
    return new Response(
      await Bun.file(new URL(`./public/${filename}`, import.meta.url)).text(),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  },
});
console.log('Atlas Studio demo: http://127.0.0.1:4178');
