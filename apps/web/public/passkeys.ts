import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
const status = document.querySelector<HTMLElement>('[data-passkey-message]') ?? document.querySelector<HTMLElement>('[data-auth-message]');
const say = (text: string) => { if (status) status.textContent = text; };
async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/auth/${path}`, { credentials: 'same-origin', redirect: 'error', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again before managing your sign-in methods.' : response.status === 429 ? 'Too many attempts. Try again in a minute.' : result.message || 'Unable to complete this request. Please try again.');
  return result;
}
const next = new URLSearchParams(location.search).get('next');
const destination = next && (/^\/device\?user_code=[A-Za-z0-9-]{4,32}$/.test(next) || /^\/(?:hooks(?:\/(?:new|admin|[A-Za-z0-9-]{1,100})(?:\/edit)?)?|account\/hooks)$/.test(next)) ? next : '/account';
let busy = false;
async function run(action: () => Promise<void>) {
  if (busy || document.querySelector<HTMLButtonElement>('[data-auth-form] button')?.disabled) return;
  busy = true;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-google-sign-in],[data-passkey-sign-in],[data-passkey-add],[data-passkey-remove],[data-google-link],[data-auth-form] button')];
  const previousDisabled = buttons.map(button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  say('Working…');
  try { await action(); }
  catch (error) { say(error instanceof Error && error.name === 'NotAllowedError' ? 'Passkey request cancelled. You can try again or use another sign-in method.' : error instanceof Error ? error.message : 'Unable to complete this request.'); }
  finally { busy = false; buttons.forEach((button, index) => { button.disabled = previousDisabled[index]; }); }
}
function oauthRedirect(result: { url?: string }) {
  if (!result.url || new URL(result.url).origin !== 'https://accounts.google.com') throw new Error('Google sign-in is unavailable. Please try again.');
  location.assign(result.url);
}
document.querySelector('[data-google-sign-in]')?.addEventListener('click', () => void run(async () => {
  oauthRedirect(await request('sign-in/social', { provider: 'google', callbackURL: `${location.origin}${destination}`, errorCallbackURL: `${location.origin}/sign-in?error=google`, disableRedirect: true }));
}));
const signIn = document.querySelector<HTMLButtonElement>('[data-passkey-sign-in]');
const add = document.querySelector<HTMLButtonElement>('[data-passkey-add]');
if (!browserSupportsWebAuthn() || !window.isSecureContext) {
  [signIn, add].forEach(button => { if (button) { button.disabled = true; button.title = 'Passkeys require a supported browser and a secure connection.'; } });
} else {
  signIn?.addEventListener('click', () => void run(async () => {
    const options = await request('passkey/generate-authenticate-options');
    const { clientExtensionResults: _, ...response } = await startAuthentication({ optionsJSON: options });
    await request('passkey/verify-authentication', { response });
    location.assign(destination);
  }));
  add?.addEventListener('click', () => void run(async () => {
    const name = document.querySelector<HTMLInputElement>('[data-passkey-name]')?.value.trim() || 'My passkey';
    const options = await request('passkey/generate-register-options');
    const { clientExtensionResults: _, ...response } = await startRegistration({ optionsJSON: options });
    await request('passkey/verify-registration', { response, name });
    await loadPasskeys(); say('Passkey created. You can use it the next time you sign in.');
  }));
}
const list = document.querySelector<HTMLElement>('[data-passkey-list]');
async function loadPasskeys() {
  if (!list) return;
  list.setAttribute('aria-busy', 'true');
  try {
    const items = await request('passkey/list-user-passkeys');
    if (!Array.isArray(items)) throw new Error('Unable to load passkeys.');
    list.replaceChildren();
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'account-caption'; empty.textContent = 'No passkeys yet. Create one for faster sign-in.'; list.append(empty); }
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'account-session';
      const info = document.createElement('div'); info.className = 'account-session-info';
      const title = document.createElement('strong'); title.textContent = item.name || 'Passkey';
      const meta = document.createElement('p'); meta.className = 'account-session-meta';
      const date = new Date(item.createdAt);
      meta.textContent = `${item.backedUp ? 'Saved in your passkey provider' : 'Device passkey'}${Number.isFinite(date.getTime()) ? ` · Added ${date.toLocaleDateString()}` : ''}`;
      info.append(title, meta);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'account-button'; remove.dataset.passkeyRemove = ''; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${item.name || 'passkey'}`);
      remove.addEventListener('click', () => {
        if (!confirm('Remove this passkey? You can still sign in with Google or your account password.')) return;
        void run(async () => { await request('passkey/delete-passkey', { id: item.id }); await loadPasskeys(); say('Passkey removed.'); });
      });
      row.append(info, remove); list.append(row);
    }
  } catch (error) {
    list.replaceChildren(); const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'account-button'; retry.textContent = 'Retry loading passkeys'; retry.addEventListener('click', () => void loadPasskeys()); list.append(retry);
    say(error instanceof Error ? error.message : 'Unable to load passkeys.');
  } finally { list.setAttribute('aria-busy', 'false'); }
}
if (list) {
  void loadPasskeys();
  void fetch('/api/sign-in-options', { credentials: 'same-origin' }).then(response => response.json()).then(async options => {
    if (!options.google) return;
    const section = document.querySelector<HTMLElement>('[data-google-link-section]');
    const link = document.querySelector<HTMLButtonElement>('[data-google-link]');
    if (!section || !link) return;
    const accounts = await request('list-accounts');
    section.hidden = false;
    if (accounts.some((account: { providerId: string }) => account.providerId === 'google')) { link.textContent = 'Google connected'; link.disabled = true; return; }
    link.addEventListener('click', () => void run(async () => {
      oauthRedirect(await request('link-social', { provider: 'google', callbackURL: `${location.origin}/account`, errorCallbackURL: `${location.origin}/account?error=google`, disableRedirect: true }));
    }));
  }).catch(() => {});
}
if (new URLSearchParams(location.search).get('error') === 'google') say('Google sign-in wasn’t completed. Try again, or sign in with email and connect Google from Devices & sessions.');
