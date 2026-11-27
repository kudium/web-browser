/** Self-contained chrome for the isolated activity view; never website markup. */
export const AI_ACTIVITY_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;--primary:#5aaca8;--glow:color-mix(in srgb,var(--primary) 58%,white);--surface:color-mix(in srgb,var(--primary) 7%,#191b1e)}
@property --orbit{syntax:"<angle>";initial-value:0deg;inherits:false}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;cursor:default}
.frame{position:absolute;inset:0;border-radius:10px;overflow:hidden;pointer-events:none;animation:arrive 700ms ease-out}
.frame:before,.frame:after{content:"";position:absolute;inset:-2px;border-radius:inherit;pointer-events:none;mask:linear-gradient(to bottom,#000,transparent 34px,transparent calc(100% - 34px),#000),linear-gradient(to right,#000,transparent 34px,transparent calc(100% - 34px),#000);mask-composite:add}
.frame:before{background:conic-gradient(from var(--orbit),color-mix(in srgb,#68ddd0 70%,var(--primary)),color-mix(in srgb,#8ce3af 70%,var(--primary)),color-mix(in srgb,#e9d99a 70%,var(--primary)),color-mix(in srgb,#f1a6be 70%,var(--primary)),color-mix(in srgb,#c3a0ee 70%,var(--primary)),color-mix(in srgb,#8caff0 70%,var(--primary)),color-mix(in srgb,#68ddd0 70%,var(--primary)));filter:blur(9px);opacity:.48;animation:orbit 18s linear infinite reverse,frame-pulse 10s ease-in-out infinite}
.frame:after{background:conic-gradient(from var(--orbit),transparent 0deg 205deg,color-mix(in srgb,var(--primary) 40%,transparent) 240deg,var(--primary) 270deg,var(--glow) 284deg,color-mix(in srgb,var(--primary) 70%,transparent) 300deg,transparent 324deg 360deg);filter:blur(6px);opacity:.98;animation:orbit 10s linear infinite}
.dock{position:absolute;z-index:3;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100% - 24px);padding:10px 12px;border:1px solid #ffffff24;border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--surface) 94%,transparent),#17191cf2);box-shadow:0 8px 32px #0005,0 0 28px color-mix(in srgb,var(--primary) 26%,transparent),inset 0 1px 0 #ffffff12;backdrop-filter:blur(24px) saturate(130%);animation:arrive 240ms ease-out}
.drag-handle{cursor:grab;touch-action:none;user-select:none;border:0;margin:0;padding:6px 2px;background:transparent;color:#aeb2b8;border-radius:6px}.drag-handle svg{width:10px;height:20px}.drag-handle:active,.dock.dragging .drag-handle{cursor:grabbing}.dock.dragging{user-select:none}.copy{min-width:0;flex:1}.task-hint{font-size:10px;color:#afb3bd;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}.dock{cursor:grab;touch-action:none;user-select:none}.dock.dragging{cursor:grabbing}body[data-paused=true] .frame,body[data-paused=true] .agent-pointer{display:none}body[data-paused=true] .dock{left:0!important;top:0!important;bottom:auto!important;transform:none!important;width:100%;max-width:none;height:100%}body[data-paused=true] .dot{animation:none;opacity:.55}.title{overflow:hidden;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#f4f5f6;white-space:nowrap}
.title span[role=status]{overflow:hidden;text-overflow:ellipsis}.dot{flex-shrink:0;width:6px;height:6px;border-radius:50%;background:var(--glow);box-shadow:0 0 8px color-mix(in srgb,var(--primary) 50%,transparent);animation:signal 7s ease-out infinite}
button{display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:6px;border:1px solid #ffffff26;border-radius:9px;padding:8px 10px;background:#ffffff09;color:#f4f5f6;font:500 11px system-ui;cursor:pointer;transition:background 140ms ease,border-color 140ms ease,transform 140ms ease}
button svg{width:14px;height:14px}button:hover{background:#ffffff14;border-color:#ffffff45}button:active{transform:scale(.97)}button:focus-visible{outline:2px solid var(--glow);outline-offset:3px}button:disabled{opacity:.65;cursor:default}
.agent-pointer{position:absolute;left:0;top:0;pointer-events:none;opacity:0;z-index:2;transition:transform 180ms cubic-bezier(.2,.8,.2,1),opacity 180ms ease;filter:drop-shadow(0 2px 4px #0005)}
.agent-pointer.visible{opacity:1}.agent-pointer svg{display:block;width:24px;height:28px;fill:var(--surface);stroke:var(--glow)}.agent-pointer .label{position:absolute;left:21px;top:23px;background:var(--surface);color:#f4f5f6;border:1px solid #ffffff26;border-radius:6px;padding:3px 7px;font-size:10px;white-space:nowrap}
.agent-pointer.edge-x .label{left:auto;right:4px}.agent-pointer.edge-y .label{top:auto;bottom:20px}
.pointer-ring{position:absolute;left:-12px;top:-12px;width:28px;height:28px;border:2px solid var(--glow);border-radius:50%;opacity:0}.agent-pointer.pressed .pointer-ring{opacity:.7;transform:scale(.8)}.agent-pointer.click .pointer-ring{animation:pointer-click 460ms ease-out}
@keyframes pointer-click{from{opacity:.9;transform:scale(.5)}to{opacity:0;transform:scale(1.8)}}
@keyframes frame-pulse{50%{opacity:.38}}
@keyframes orbit{to{--orbit:360deg}}
@keyframes signal{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--primary) 60%,transparent)}80%,100%{box-shadow:0 0 0 6px transparent}}
@keyframes breathe{50%{opacity:.55}}@keyframes arrive{from{opacity:0}to{opacity:1}}@keyframes dock-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
@media(max-width:420px){.dock{gap:8px;padding:8px}.mark{display:none}}
@media(max-width:300px){.dock{gap:6px}.title{font-size:11px}button{font-size:10px;padding:6px 8px;margin-left:0}#take-control svg{display:none}.drag-handle{padding:4px 0}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
</style></head><body>
<div class="frame" aria-hidden="true"></div>
<div id="agent-pointer" class="agent-pointer" aria-hidden="true"><span class="pointer-ring"></span><svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 2 21 14l-9 2-4 9Z"/></svg><span class="label">AI</span></div>
<div class="dock" aria-label="AI activity">
<button class="drag-handle" type="button" aria-label="Move AI activity" title="Drag to move · Arrow keys to reposition" aria-describedby="move-help"><svg viewBox="0 0 10 20" fill="currentColor" aria-hidden="true"><circle cx="2" cy="4" r="1"/><circle cx="7" cy="4" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="7" cy="10" r="1"/><circle cx="2" cy="16" r="1"/><circle cx="7" cy="16" r="1"/></svg></button>
<span id="move-help" hidden>Drag or use arrow keys to move. Home resets the position.</span>
<div class="copy"><div class="title"><span class="dot" aria-hidden="true"></span><span id="activity-title" role="status">AI is working</span></div><div class="task-hint" id="task-hint">Working on your request…</div></div>
<button id="take-control" type="button" aria-label="Take control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 4-2 7-6 7h-2c-2 0-3-1-4-2l-5-6a2 2 0 0 1 3-3l2 2Z"/></svg>Take control</button>
</div><script>
const button=document.getElementById('take-control');
const dock=document.querySelector('.dock'),handle=document.querySelector('.drag-handle'),pointer=document.getElementById('agent-pointer');
let position=null,drag=null,hideTimer,clickTimer;
function place(x,y){
  const rect=dock.getBoundingClientRect(),inset=12;
  x=Math.max(inset,Math.min(x,innerWidth-rect.width-inset));
  y=Math.max(inset,Math.min(y,innerHeight-rect.height-inset));
  position={x,y};dock.style.left=x+'px';dock.style.top=y+'px';dock.style.bottom='auto';dock.style.transform='none';
}
dock.addEventListener('pointerdown',event=>{
  if(!event.isTrusted||event.button!==0||event.target.closest('#take-control'))return;
  const rect=dock.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX-rect.x,y:event.clientY-rect.y};
  handle.focus();dock.setPointerCapture(event.pointerId);dock.classList.add('dragging');event.preventDefault();
});
dock.addEventListener('pointermove',event=>{if(drag&&drag.id===event.pointerId){if(document.body.dataset.paused==='true'){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;console.debug('kudiumbrowser-ai-drag:'+JSON.stringify({dx,dy}))}else place(event.clientX-drag.x,event.clientY-drag.y)}});
function endDrag(){drag=null;dock.classList.remove('dragging')}
dock.addEventListener('pointerup',endDrag);dock.addEventListener('pointercancel',endDrag);dock.addEventListener('lostpointercapture',endDrag);
handle.addEventListener('keydown',event=>{
  const steps={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
  if(document.body.dataset.paused==='true'&&steps[event.key]){const [dx,dy]=steps[event.key];console.debug('kudiumbrowser-ai-drag:'+JSON.stringify({dx,dy}));event.preventDefault();return}
  if(event.key==='Home'){position=null;dock.removeAttribute('style');event.preventDefault();return}
  const step=steps[event.key];if(!step)return;
  const rect=dock.getBoundingClientRect();place(rect.x+step[0],rect.y+step[1]);event.preventDefault();
});
let resizeFrame=0;
new ResizeObserver(()=>{if(resizeFrame)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(position)place(position.x,position.y)})}).observe(dock);
addEventListener('pagehide',()=>cancelAnimationFrame(resizeFrame),{once:true});
addEventListener('resize',()=>{if(position)place(position.x,position.y);pointer.classList.remove('visible')});
window.showAIPointer=point=>{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>=innerWidth||point.y>=innerHeight)return;
  pointer.style.transform='translate('+point.x+'px,'+point.y+'px)';pointer.classList.add('visible');
  pointer.classList.toggle('edge-x',point.x>innerWidth-65);pointer.classList.toggle('edge-y',point.y>innerHeight-55);
  if(point.type==='mousePressed')pointer.classList.add('pressed');
  if(point.type==='mouseReleased'||point.type==='drop'){
    pointer.classList.remove('pressed','click');void pointer.offsetWidth;pointer.classList.add('click');
    clearTimeout(clickTimer);clickTimer=setTimeout(()=>pointer.classList.remove('click'),480);
  }
  clearTimeout(hideTimer);hideTimer=setTimeout(()=>pointer.classList.remove('visible'),2400);
};
window.resetAIActivity=()=>{clearTimeout(hideTimer);clearTimeout(clickTimer);pointer.className='agent-pointer';button.disabled=false;endDrag()};
window.setAIActivityState=(paused,text,point)=>{
  window.resetAIActivity();document.body.dataset.paused=String(paused);
  document.getElementById('activity-title').textContent=paused?'You have control':'AI is working';
  if(text)document.getElementById('task-hint').textContent=text;
  button.setAttribute('aria-label',paused?'Resume AI':'Take control');
  button.lastChild.textContent=paused?'Resume AI':'Take control';button.disabled=false;
  if(!paused&&point)place(point.x,point.y);
};
window.setAITaskHint=text=>{document.getElementById('task-hint').textContent=text};
button.addEventListener('click',event=>{if(!event.isTrusted||button.disabled)return;button.disabled=true;console.debug(document.body.dataset.paused==='true'?'kudiumbrowser-ai-explicit-resume':'kudiumbrowser-ai-explicit-takeover')});
addEventListener('wheel',event=>event.preventDefault(),{passive:false});
addEventListener('keydown',event=>{if(event.key==='Tab'||event.target===button||event.target===handle)return;event.preventDefault()});
</script></body></html>`;
