// Hash router that keeps a WebSocket open, as dev servers do for reloads.
const view = document.getElementById('view');
const routes = {
  '/': () => '<h2>Home</h2><p id="home">Welcome to the SPA.</p><button id="load">Load items</button><ul id="list"></ul>',
  '/settings': () => '<h2>SPA settings</h2><label for="theme">Theme</label> <select id="theme"><option>Light</option><option>Dark</option></select> <button id="apply">Apply</button><p id="result">Unchanged</p>',
};
function render() {
  const route = location.hash.replace(/^#/, '') || '/';
  view.innerHTML = (routes[route] || (() => '<p>Not found</p>'))();
  document.getElementById('load')?.addEventListener('click', async () => {
    const items = await (await fetch('/api/items')).json();
    document.getElementById('list').innerHTML = items.map((x) => `<li>${x.name}</li>`).join('');
  });
  document.getElementById('apply')?.addEventListener('click', () => {
    document.getElementById('result').textContent = 'Applied ' + document.getElementById('theme').value;
  });
}
window.addEventListener('hashchange', render);
render();
const socket = new WebSocket(`ws://${location.host}/ws`);
socket.onopen = () => { document.getElementById('socket').textContent = 'socket: open'; };
socket.onmessage = (event) => { document.getElementById('socket').textContent = 'socket: ' + event.data; };
socket.onclose = () => { document.getElementById('socket').textContent = 'socket: closed'; };
