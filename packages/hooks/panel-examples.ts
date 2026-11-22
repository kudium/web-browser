export type HookStage = "before" | "after" | "css";
export interface HookExample {
  id: string;
  name: string;
  stage: HookStage;
  source: string;
}
/** Shared with the website tutorial so copied examples match the app runtime. */
export const hookPanelExamples: HookExample[] = [
  {
    id: "panel-markdown",
    name: "Panel: Markdown output",
    stage: "after",
    source: `await context.panel.show({
  id: 'summary', title: 'Page summary', reveal: true,
  content: { type: 'markdown', text: '# ' + document.title + '\\n\\n[Open this page](' + url + ')' }
});`,
  },
  {
    id: "panel-table",
    name: "Panel: link table",
    stage: "after",
    source: `const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 30);
await context.panel.show({
  id: 'links', title: 'Page links', reveal: true,
  content: { type: 'table', columns: ['Label', 'URL'], rows: links.map(a => [a.textContent.trim(), a.href]) }
});`,
  },
  {
    id: "panel-json",
    name: "Panel: JSON inspector",
    stage: "after",
    source: `await context.panel.show({
  id: 'inspector', title: 'Page inspector', reveal: true,
  content: { type: 'json', value: { title: document.title, url, headings: document.querySelectorAll('h1,h2,h3').length } }
});`,
  },
  {
    id: "panel-status",
    name: "Panel: status and refresh action",
    stage: "after",
    source: `const publish = async (reveal = false) => context.panel.update({
  id: 'monitor', title: 'Page status', reveal,
  content: { type: 'status', state: 'success', text: 'Page has ' + document.querySelectorAll('a[href]').length + ' links.' },
  actions: [{ id: 'refresh', label: 'Refresh' }]
});
context.panel.onAction('refresh', () => publish());
await context.panel.show({ id: 'monitor', title: 'Page status', reveal: true, content: { type: 'status', state: 'loading', text: 'Reading page…' } });
await publish();`,
  },
  {
    id: "panel-html",
    name: "Panel: custom HTML dashboard",
    stage: "after",
    source: `// The page hook owns DOM access; the custom panel receives JSON only.
const content = {
  type: 'html',
  html: '<main><h1>Page dashboard</h1><p id="count"></p><input placeholder="Your scratch note"><button id="refresh">Refresh</button><p id="error" role="alert"></p></main>',
  css: 'main{padding:16px}h1{font-size:18px}input{display:block;width:100%;padding:8px;margin:12px 0}button{width:100%}',
  script: "kudiumHookPanel.onUpdate(output => { document.getElementById('count').textContent = output.content.data.links + ' links on this page'; }); document.getElementById('refresh').onclick = async () => { const button = document.getElementById('refresh'); button.disabled = true; try { await kudiumHookPanel.invoke('refresh'); } catch (error) { document.getElementById('error').textContent = error.message; } finally { button.disabled = false; } };"
};
const publish = async (reveal = false) => context.panel.update({
  id: 'dashboard', title: 'Page dashboard', reveal,
  content: { ...content, data: { links: document.querySelectorAll('a[href]').length } },
  actions: [{ id: 'refresh', label: 'Refresh page counts' }]
});
context.panel.onAction('refresh', () => publish());
await publish(true);
// Updating data retains the scratch note. Changing HTML/CSS/script replaces the view.`,
  },
];
