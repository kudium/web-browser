import { marked } from 'marked';
import type { HookPanelOutput } from '../browser/hookPanels';
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function hookPanelPresentation(output: HookPanelOutput) {
  const c = output.content;
  let html = '';
  if (c.type === 'text') html = `<pre>${escape(c.text)}</pre>`;
  if (c.type === 'status')
    html = `<div role="status" class="status ${c.state}">${escape(c.text)}</div>`;
  if (c.type === 'json')
    html = `<pre>${escape(JSON.stringify(c.value, null, 2))}</pre>`;
  if (c.type === 'table')
    html = `<div class="table-scroll"><table><thead><tr>${c.columns.map((v) => `<th>${escape(v)}</th>`).join('')}</tr></thead><tbody>${c.rows.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (c.type === 'markdown') {
    const renderer = new marked.Renderer();
    renderer.html = () => '';
    renderer.image = ({ text }) => escape(text);
    renderer.link = ({ href, text }) =>
      /^https?:\/\//i.test(href)
        ? `<a href="${escape(href)}">${escape(text)}</a>`
        : escape(text);
    html = marked.parse(c.text, { renderer, async: false }) as string;
  }
  return { ...output, renderedHTML: html };
}
export function hookPanelDocument(output: HookPanelOutput) {
  const c = output.content;
  const custom = c.type === 'html';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"><style>html{color-scheme:light dark;font:13px system-ui}*{box-sizing:border-box}body{margin:0;padding:${custom ? '0' : '16px'};overflow-wrap:anywhere}pre{white-space:pre-wrap;font:12px ui-monospace,monospace}button{font:inherit;padding:7px 10px;cursor:pointer;border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:6px;background:Canvas;color:CanvasText}a{color:LinkText}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid color-mix(in srgb,CanvasText 20%,transparent)}#panel-actions:empty{display:none}#panel-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.status{padding:12px;border-radius:8px;background:color-mix(in srgb,CanvasText 8%,transparent)}.error{color:light-dark(#b91c1c,#fca5a5)}${custom ? c.css || '' : ''}</style></head><body>${custom ? c.html : '<main id="panel-output"></main>'}<div id="panel-actions"></div><p id="panel-error" role="alert" hidden></p><script>
const bridge=window.kudiumHookPanel;
bridge.onUpdate(output=>{
  ${custom ? '' : "document.getElementById('panel-output').innerHTML=output.renderedHTML;"}
  const actions=document.getElementById('panel-actions');actions.replaceChildren();
  if(output.content.type !== 'html') for(const action of output.actions||[]){const button=document.createElement('button');button.textContent=action.label;button.onclick=async()=>{button.disabled=true;const error=document.getElementById('panel-error');error.hidden=true;try{await bridge.invoke(action.id)}catch(e){error.textContent=String(e.message||e);error.hidden=false}finally{button.disabled=false}};actions.append(button)}
});
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(a){event.preventDefault();bridge.openLink(a.href).catch(()=>{})}});
</script>${custom && c.script ? '<script>' + c.script.replace(/<\/script/gi, '<\\/script') + '</script>' : ''}</body></html>`;
}
