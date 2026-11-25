if (!/^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/.test(location.pathname)) return;
let prNodes = [], prReviewed = new Set(), prIdentity = location.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+/)[0];
const storageKey = 'kudium-pr-notes:' + prIdentity;
try { prReviewed = new Set(JSON.parse(sessionStorage.getItem(storageKey)||'[]').filter(path => typeof path === 'string')); } catch {}
const scanPR = () => {
  const roots = [...document.querySelectorAll('.file[data-path], [data-file-path]')];
  const deduped = new Map();
  for (const root of roots) {
    const path = root.getAttribute('data-path') || root.getAttribute('data-file-path');
    if (!path || deduped.has(path)) continue;
    deduped.set(path,{node:root,path});
  }
  prNodes = [...deduped.values()].slice(0,150);
  const files = prNodes.map(({node,path},index) => ({ index,path:path.slice(0,500),folder:path.includes('/')?path.slice(0,path.lastIndexOf('/')).slice(0,180):'Root',
    additions:Number(node.querySelector('.diffstat .color-fg-success')?.textContent?.replace(/\D/g,'')) || 0,
    deletions:Number(node.querySelector('.diffstat .color-fg-danger')?.textContent?.replace(/\D/g,'')) || 0,
    reviewed:prReviewed.has(path), test:/test|spec|__tests__/i.test(path) }));
  while (JSON.stringify(files).length > 40000) { files.pop(); prNodes.pop(); }
  const comments = [...document.querySelectorAll('.review-thread, .js-resolvable-timeline-thread-container')].slice(0,40).map(node => node.innerText.trim().slice(0,420)).filter(Boolean);
  const description = document.querySelector('.js-comment-body, [data-testid="issue-body"]')?.innerText?.trim().slice(0,1800) || '';
  const filesTab = document.querySelector('#files_tab_counter, [data-content="Files changed"] .Counter');
  return { title:document.querySelector('.js-issue-title, [data-testid="issue-title"]')?.textContent?.trim().slice(0,180) || document.title.split('·')[0].trim().slice(0,180),
    url:location.origin+prIdentity, branch:document.querySelector('.head-ref')?.textContent?.trim().slice(0,160) || '', files, comments, description,
    total:Number(filesTab?.textContent?.replace(/\D/g,'')) || files.length };
};
const publishPR = async () => context.panel.update({id:'pr',title:'PR review navigator',content:{type:'html',...panelDesign,data:scanPR()},actions:prActions});
const prActions = [{id:'pr-refresh',label:'Refresh'},{id:'pr-jump',label:'Jump to file'},{id:'pr-check',label:'Mark checked'}];
context.panel.onAction('pr-refresh',async()=>{await publishPR();return {refreshed:true};});
context.panel.onAction('pr-jump',async payload=>{
  const entry=prNodes[Number(payload?.index)]; if (!entry || !Number.isInteger(payload?.index)) throw new Error('Refresh the file list first.');
  entry.node.scrollIntoView({behavior:'auto',block:'start'}); return {path:entry.path};
});
context.panel.onAction('pr-check',async payload=>{
  const entry=prNodes[Number(payload?.index)]; if (!entry || !Number.isInteger(payload?.index)) throw new Error('Refresh the file list first.');
  prReviewed.has(entry.path)?prReviewed.delete(entry.path):prReviewed.add(entry.path);
  try { sessionStorage.setItem(storageKey,JSON.stringify([...prReviewed].slice(0,1000))); } catch {}
  await publishPR(); return {checked:prReviewed.has(entry.path)};
});
await context.panel.show({id:'pr',title:'PR review navigator',reveal:false,content:{type:'html',...panelDesign,data:scanPR()},actions:prActions});
