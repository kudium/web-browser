let explorerNodes = [];
const safeLink = raw => { try {const target=new URL(raw,location.href);return /^https?:$/.test(target.protocol)&&!target.username&&!target.password&&target.href.length<=2048?target.href:null;}catch{return null;} };
const scanPage = () => {
  const pageRoot = document.querySelector('article,main,[role="main"]') || document.body;
  explorerNodes = [...pageRoot.querySelectorAll('h1,h2,h3,h4')].filter(node=>node.getClientRects().length&&node.textContent.trim()).slice(0,120);
  const links = new Map(); let linkBudget = 0;
  for(const anchor of pageRoot.querySelectorAll('a[href]')) {
    if(!anchor.getClientRects().length||anchor.closest('nav,footer,aside'))continue;
    const target=safeLink(anchor.getAttribute('href'));if(!target||links.has(target))continue;
    const parsed=new URL(target);const entry={url:target,label:(anchor.textContent.trim()||parsed.hostname).slice(0,180),domain:parsed.hostname,external:parsed.origin!==location.origin};
    const size=JSON.stringify(entry).length;if(linkBudget+size>35000)break;linkBudget+=size;links.set(target,entry);
    if(links.size>=180)break;
  }
  return {title:document.title.slice(0,200),url:location.href.slice(0,2048),headings:explorerNodes.map((node,index)=>({index,text:node.textContent.trim().slice(0,240),level:Number(node.tagName[1])})),links:[...links.values()]};
};
const explorerActions=[{id:'explorer-refresh',label:'Refresh'},{id:'explorer-jump',label:'Jump to section'}];
context.panel.onAction('explorer-refresh',async()=>{await context.panel.update({id:'explorer',title:'Page outline & links',content:{type:'html',...panelDesign,data:scanPage()},actions:explorerActions});return {refreshed:true};});
context.panel.onAction('explorer-jump',async payload=>{if(!Number.isInteger(payload?.index)||!explorerNodes[payload.index])throw new Error('Refresh the outline first.');explorerNodes[payload.index].scrollIntoView({behavior:'auto',block:'start'});return {jumped:true};});
await context.panel.show({id:'explorer',title:'Page outline & links',reveal:false,content:{type:'html',...panelDesign,data:scanPage()},actions:explorerActions});
