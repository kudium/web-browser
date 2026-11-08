const code = new URLSearchParams(location.search).get('user_code');
const message = document.querySelector('[data-device-message]');
const approve = document.querySelector('[data-device-approve]');
const deny = document.querySelector('[data-device-deny]');
document.querySelector('[data-device-code]').textContent = code || '—';
async function review() {
  const response = await fetch(`/api/auth/device?user_code=${encodeURIComponent(code || '')}`, {credentials:'same-origin',redirect:'error'});
  const data = await response.json();
  if (!response.ok || data.client_id !== 'kudium-desktop' || data.status !== 'pending') throw new Error('This request has expired or was already processed. Start again in the app.');
  approve.disabled = false;deny.disabled = false;message.textContent = 'Ready to connect. Confirm the codes match.';
}
async function decide(action) {
  approve.disabled = true;deny.disabled = true;
  try {
    const response = await fetch(`/api/auth/device/${action}`, {method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({userCode:code})});
    if (!response.ok) throw new Error('Unable to finish. Start a new connection in the app.');
    message.textContent = action === 'approve' ? 'Device approved. Return to Kudium Browser to set up encrypted sync.' : 'Connection cancelled.';
  } catch(error) {message.textContent = error.message;}
}
approve.addEventListener('click',()=>decide('approve'));deny.addEventListener('click',()=>decide('deny'));
review().catch(error=>{message.textContent=error.message;});
