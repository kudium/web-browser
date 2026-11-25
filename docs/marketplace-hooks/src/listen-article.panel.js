const synth = window.speechSynthesis;
let articleData, speechChunks = [], speechIndex = 0, playing = false, paused = false, generation = 0, activeUtterance;
const el = id => document.getElementById(id);
const localVoices = () => synth ? synth.getVoices().filter(voice => voice.localService) : [];
function voiceList() {
  const saved = el('voice').value, voices = localVoices();
  el('voice').replaceChildren(...voices.map(voice => { const option = document.createElement('option'); option.value = voice.voiceURI; option.textContent = voice.name + ' · ' + voice.lang; return option; }));
  const matching = voices.find(voice => voice.voiceURI === saved) || voices.find(voice => voice.lang.toLowerCase() === (articleData?.lang || 'en').toLowerCase()) || voices.find(voice => voice.name === 'Samantha') || voices[0];
  if (matching) el('voice').value = matching.voiceURI;
  el('play').disabled = !voices.length || !speechChunks.length;
  if (!voices.length) el('status').textContent = 'No local voice is available. Install a voice in macOS Accessibility → Spoken Content.';
  else controls();
}
function controls() {
  const label = playing ? (paused ? 'Resume' : 'Pause') : 'Play';
  el('play').setAttribute('aria-label', label);
  el('play').innerHTML = '<svg viewBox="0 0 24 24"><path d="' + (playing && !paused ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'm9 5 11 7-11 7z') + '"/></svg><span class="sr-only">' + label + '</span>';
  el('progress').value = speechIndex;
  const paragraph = speechChunks[speechIndex]?.paragraph || 0;
  [...el('transcript').children].forEach((node,index) => { node.style.background = index === paragraph ? 'color-mix(in srgb,var(--kudium-primary) 16%,Canvas)' : ''; node.setAttribute('aria-current', String(index === paragraph)); });
  el('status').textContent = !speechChunks.length ? 'No readable article text found. Select text on the page, then refresh.' :
    (playing ? (paused ? 'Paused' : 'Playing') : 'Ready') + ' · passage ' + (paragraph+1) + ' of ' + articleData.paragraphs.length + ' · ' + Math.round(100 * speechIndex / Math.max(1,speechChunks.length-1)) + '%';
}
function cancel() { generation++; if (synth) synth.cancel(); playing = paused = false; activeUtterance = undefined; }
function speak() {
  if (!synth || !speechChunks.length) return;
  const voice = localVoices().find(item => item.voiceURI === el('voice').value);
  if (!voice) { voiceList(); return; }
  cancel(); playing = true; const ticket = generation;
  function queue() {
    if (ticket !== generation) return;
    const chunk = speechChunks[speechIndex];
    if (!chunk) { playing = false; speechIndex = 0; controls(); el('status').textContent = 'Finished · ready to listen again'; return; }
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    activeUtterance = utterance; utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = Number(el('speed').value);
    utterance.onend = () => { if (ticket === generation) { speechIndex++; queue(); } };
    utterance.onerror = event => { if (ticket !== generation) return; cancel(); controls(); el('error').textContent = 'Playback stopped: ' + event.error + '. Try another local voice.'; };
    controls(); synth.speak(utterance);
  }
  el('error').textContent = ''; queue();
}
el('play').onclick = () => { if (!playing) speak(); else { paused = !paused; paused ? synth.pause() : synth.resume(); controls(); } };
el('stop').onclick = () => { cancel(); speechIndex = 0; controls(); };
function seek(index) { const resume = playing; cancel(); speechIndex = Math.min(Math.max(0,index),Math.max(0,speechChunks.length-1)); controls(); if (resume) speak(); }
el('progress').onchange = () => seek(Number(el('progress').value));
for (const [id,direction] of [['previous',-1],['next',1]]) el(id).onclick = () => { const paragraph = (speechChunks[speechIndex]?.paragraph || 0) + direction; const index = speechChunks.findIndex(chunk => chunk.paragraph === paragraph); if (index >= 0) seek(index); };
for (const id of ['voice','speed']) el(id).onchange = () => { if (playing) speak(); };
el('refresh').onclick = async () => { el('refresh').disabled = true; cancel(); try { await kudiumHookPanel.invoke('article-refresh'); } catch(error) { el('error').textContent = error.message; } finally { el('refresh').disabled = false; } };
kudiumHookPanel.onUpdate(output => {
  cancel(); articleData = output.content.data; speechIndex = 0; speechChunks = [];
  articleData.paragraphs.forEach((text,paragraph) => { let rest = text; while (rest.length) { let cut = Math.min(220,rest.length); if (cut < rest.length) { const space = rest.lastIndexOf(' ',cut); if (space > 60) cut = space; } speechChunks.push({text:rest.slice(0,cut),paragraph}); rest = rest.slice(cut).trimStart(); } });
  el('title').textContent = articleData.title; el('meta').textContent = articleData.words + ' words · about ' + Math.max(1,Math.ceil(articleData.words / 170)) + ' min at 1×' + (articleData.selection ? ' · selected passage' : '');
  el('source').href = articleData.url; el('progress').max = Math.max(0,speechChunks.length-1);
  el('limit').textContent = articleData.limited ? 'Showing the first 30,000 characters. Select a later section and refresh to continue.' : '';
  el('transcript').replaceChildren(...articleData.paragraphs.map((text,paragraph) => { const button = document.createElement('button'); button.className = 'item'; button.textContent = text; button.onclick = () => { seek(speechChunks.findIndex(chunk => chunk.paragraph === paragraph)); }; return button; }));
  controls(); voiceList();
});
if (synth) synth.addEventListener('voiceschanged', voiceList);
window.addEventListener('beforeunload',cancel);
