const el=id=>document.getElementById(id);
const icons={image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',video:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',audio:'<path d="M9 18V5l11-2v13M9 7l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'};
function icon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=icons[kind]||icons.image;return svg;}
let busy=false,mediaState;
async function invoke(id,payload){if(busy)return;busy=true;el('error').textContent='';document.querySelectorAll('button').forEach(node=>node.disabled=true);try{await kudiumHookPanel.invoke(id,payload);}catch(error){el('error').textContent=String(error.message||error);}finally{busy=false;document.querySelectorAll('button').forEach(node=>node.disabled=false);if(mediaState){el('previous').disabled=mediaState.page===0;el('next').disabled=mediaState.page+1>=mediaState.pages;}}}
kudiumHookPanel.onUpdate(output=>{
 mediaState=output.content.data;const state=mediaState;el('summary').textContent=state.total+' '+(state.total===1?'media item':'media items');el('gallery').replaceChildren();
 for(const item of state.items){const card=document.createElement('a');card.className='media-card';card.href=item.url;card.title=item.label+' · '+item.url;const preview=document.createElement('div');preview.className='preview';
  const placeholder=()=>{const node=document.createElement('div');node.className='placeholder';node.append(icon(item.kind));node.setAttribute('aria-label','Preview unavailable');return node;};
  if(item.thumbnail||item.kind==='image'){const image=document.createElement('img');image.src=item.kind==='image'?item.url:item.thumbnail;image.loading='lazy';image.referrerPolicy='no-referrer';image.alt=item.label;let fallback=false;image.onerror=()=>{if(item.thumbnail&&!fallback){fallback=true;image.src=item.thumbnail;}else image.replaceWith(placeholder());};preview.append(image);}else preview.append(placeholder());
  const badge=document.createElement('span');badge.className='kind-badge';badge.title=item.kind;badge.append(icon(item.kind));preview.append(badge);const label=document.createElement('strong');label.textContent=item.label;const domain=document.createElement('small');try{domain.textContent=new URL(item.url).hostname;}catch{domain.textContent=item.kind;}card.append(preview,label,domain);el('gallery').append(card);
 }
 if(!state.items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=state.kind==='all'?'No media found. Load more page content, then refresh.':'No '+state.kind+' media found on this page.';el('gallery').append(empty);}
 el('page-count').textContent=(state.page+1)+' / '+state.pages;el('previous').disabled=busy||state.page===0;el('next').disabled=busy||state.page+1>=state.pages;document.querySelectorAll('[data-kind]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.kind===(state.kind||'all'))));
});
for(const id of ['refresh','previous','next'])el(id).onclick=()=>invoke('media-'+id);
document.querySelectorAll('[data-kind]').forEach(node=>node.onclick=()=>invoke('media-filter',{kind:node.dataset.kind}));
