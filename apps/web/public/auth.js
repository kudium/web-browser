const form = document.querySelector('[data-auth-form]');
const message = document.querySelector('[data-auth-message]');
function showMessage(text) { if (message) message.textContent = text; }
async function authRequest(path, body) {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST', credentials: 'same-origin', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? 'Too many attempts. Please try again in a minute.' : data.message || 'Unable to complete this request. Please try again.');
  return data;
}
if (form) form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  if (button.disabled) return;
  button.disabled = true; showMessage('Working…');
  const fields = new FormData(form);
  const mode = form.dataset.authForm;
  try {
    const email = String(fields.get('email') || '').trim();
    const password = String(fields.get('password') || '');
    const next = new URLSearchParams(location.search).get('next');
    const destination = next && /^\/device\?user_code=[A-Za-z0-9-]{4,32}$/.test(next) ? next : '/account';
    const callbackURL = `${location.origin}${destination}`;
    if (mode === 'sign-up') {
      const result = await authRequest('sign-up/email', { name: String(fields.get('name') || '').trim(), email, password, callbackURL });
      if (!result.token) { showMessage('Check your email to verify your account, then sign in.'); return; }
    } else if (mode === 'sign-in') {
      await authRequest('sign-in/email', { email, password, callbackURL });
    } else if (mode === 'forgot-password') {
      await authRequest('request-password-reset', { email, redirectTo: `${location.origin}/reset-password` });
      showMessage('If that email belongs to an account, a reset link is on its way.'); return;
    } else if (mode === 'reset-password') {
      const token = new URLSearchParams(location.search).get('token');
      if (!token) throw new Error('This reset link is incomplete. Request a new link.');
      await authRequest('reset-password', { newPassword: password, token });
      history.replaceState(null, '', '/reset-password');
      location.assign('/sign-in'); return;
    }
    location.assign(destination);
  } catch (error) { showMessage(error instanceof Error ? error.message : 'Unable to complete this request.'); }
  finally { button.disabled = false; }
});
const signOut = document.querySelector('[data-sign-out]');
if (signOut) signOut.addEventListener('click', async () => {
  if (signOut.disabled) return;
  signOut.disabled = true;
  try { await authRequest('sign-out', {}); location.assign('/sign-in'); }
  catch { showMessage('Unable to sign out. Please try again.'); signOut.disabled = false; }
});
// Preserve a device approval request when moving between sign-in and sign-up.
const returnTo = new URLSearchParams(location.search).get('next');
if (returnTo && /^\/device\?user_code=[A-Za-z0-9-]{4,32}$/.test(returnTo)) {
  for (const link of document.querySelectorAll('a[href="/sign-in"],a[href="/sign-up"]')) {
    link.href = `${link.getAttribute('href')}?next=${encodeURIComponent(returnTo)}`;
  }
}
