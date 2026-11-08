const sessions = document.querySelector('[data-account-sessions]');
async function loadSessions() {
  if (!sessions) return;
  const response = await fetch('/api/auth/list-sessions', {credentials:'same-origin',redirect:'error'});
  if (!response.ok) throw new Error('Unable to load signed-in devices.');
  const items = await response.json();
  sessions.replaceChildren();
  for (const item of items) {
    const row = document.createElement('p');
    const title = document.createElement('span');
    title.textContent = `${item.userAgent || 'Kudium device'} · signed in ${new Date(item.createdAt).toLocaleDateString()} `;
    const button = document.createElement('button');button.textContent = 'Revoke';
    button.addEventListener('click',async()=>{
      if (!confirm('Revoke this session? This device will need to sign in again.')) return;
      button.disabled = true;
      try {
        const result = await fetch('/api/auth/revoke-session', {method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:item.token})});
        if (!result.ok) throw new Error();
        await loadSessions();
      } catch {button.disabled = false;button.textContent = 'Retry revocation';}
    });
    row.append(title,button);sessions.append(row);
  }
}
loadSessions().catch(()=>{if(sessions)sessions.textContent='Unable to load sessions. Refresh to try again.';});
