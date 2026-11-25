let articleParagraphs = [];
const collectArticle = () => {
  const selection = String(window.getSelection() || '').trim();
  const articleRoot = document.querySelector('article, [role="article"]') || document.querySelector('main, [role="main"]') || document.body;
  const candidates = selection ? selection.split(/\n+/) : [...articleRoot.querySelectorAll('h1,h2,h3,p,li,blockquote')]
    .filter(node => node.getClientRects().length && !node.closest('nav,footer,aside,form,button,pre,[aria-hidden="true"]') && !node.querySelector('p,li,blockquote'))
    .map(node => node.innerText);
  let budget = 30000;
  articleParagraphs = candidates.map(text => text.replace(/\s+/g, ' ').trim()).filter(text => text.length >= 15).slice(0,160)
    .flatMap(text => { if (budget <= 0) return []; const bounded = text.slice(0, Math.min(3500,budget)); budget -= bounded.length; return [bounded]; });
  return { title: document.querySelector('article h1, main h1')?.textContent?.trim().slice(0,200) || document.title.slice(0,200),
    url: location.href, lang: document.documentElement.lang || 'en', paragraphs: articleParagraphs,
    words: articleParagraphs.join(' ').split(/\s+/).filter(Boolean).length, selection: Boolean(selection), limited: budget <= 0 };
};
context.panel.onAction('article-refresh', async () => {
  await context.panel.update({ id:'listen',title:'Listen to this page',content:{type:'html',...panelDesign,data:collectArticle()},actions:[{id:'article-refresh',label:'Refresh article'}] });
  return { refreshed:true };
});
await context.panel.show({ id:'listen',title:'Listen to this page',reveal:false,content:{type:'html',...panelDesign,data:collectArticle()},actions:[{id:'article-refresh',label:'Refresh article'}] });
