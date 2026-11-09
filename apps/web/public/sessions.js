(() => {
  const sessions = document.querySelector('[data-account-sessions]');
  const count = document.querySelector('[data-account-session-count]');
  if (!sessions) return;
  const requestOptions = { credentials: 'same-origin', redirect: 'error' };
  function deviceDetails(agent = '') {
    const device = /iPad/i.test(agent) ? 'iPad' : /iPhone/i.test(agent) ? 'iPhone'
      : /Android/i.test(agent) ? 'Android device' : /Macintosh|Mac OS X/i.test(agent) ? 'Mac'
      : /Windows/i.test(agent) ? 'Windows PC' : /Linux/i.test(agent) ? 'Linux PC' : 'Device';
    const patterns = [
      ['Kudium Browser', /Kudium(?:Browser| Browser)?[ /]([\d.]+)/i],
      ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/], ['Opera', /OPR\/([\d.]+)/],
      ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/], ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
      ['Safari', /Version\/([\d.]+).*Safari/],
    ];
    const detected = patterns.map(([name, pattern]) => [name, agent.match(pattern)?.[1]]).find(([, version]) => version);
    return { device, browser: detected ? `${detected[0]} ${detected[1].split('.')[0]}` : 'Browser session', mobile: /iPhone|iPad|Android/i.test(agent) };
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function deviceIcon(mobile) {
    const icon = element('span', 'account-session-icon');
    icon.setAttribute('aria-hidden', 'true');
    // Static artwork only; session data is always inserted with textContent.
    icon.innerHTML = mobile
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 18.5h4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3.5" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4.5V21"/></svg>';
    return icon;
  }
  function sessionRow(item, currentToken) {
    const { device, browser, mobile } = deviceDetails(typeof item.userAgent === 'string' ? item.userAgent : '');
    const current = Boolean(currentToken && item.token === currentToken);
    const row = element('div', 'account-session');
    const info = element('div', 'account-session-info');
    const title = element('div', 'account-session-title', device);
    if (current) title.append(element('span', 'account-current-device', 'This device'));
    const date = new Date(item.createdAt);
    const signedIn = Number.isFinite(date.getTime()) ? `Signed in ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Sign-in date unavailable';
    info.append(title, element('p', 'account-session-meta', `${browser} · ${signedIn}`));
    const actions = element('div', 'account-session-actions');
    const button = element('button', 'account-button', 'Sign out');
    button.type = 'button';
    button.setAttribute('aria-label', `Sign out ${device}, ${browser}`);
    let confirming = false;
    const cancel = element('button', 'account-button', 'Cancel');
    cancel.type = 'button';
    const confirmation = element('p', 'account-session-confirm', current ? 'Sign out of your current session?' : 'This device will need to sign in again.');
    confirmation.setAttribute('role', 'status');
    cancel.addEventListener('click', () => {
      confirming = false;
      cancel.remove(); confirmation.remove(); button.textContent = 'Sign out';
      button.setAttribute('aria-label', `Sign out ${device}, ${browser}`); button.focus();
    });
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      if (!confirming) {
        confirming = true; button.textContent = 'Confirm';
        button.setAttribute('aria-label', `Confirm sign out ${device}, ${browser}`);
        actions.prepend(cancel); row.append(confirmation); return;
      }
      button.disabled = true; cancel.disabled = true; button.textContent = 'Signing out…';
      try {
        const result = await fetch('/api/auth/revoke-session', { ...requestOptions, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: item.token }) });
        if (!result.ok) throw new Error('Unable to sign out this device.');
        if (current) { location.assign('/sign-in'); return; }
        await loadSessions();
      } catch {
        button.disabled = false; cancel.disabled = false; button.textContent = 'Retry';
        confirmation.textContent = 'Unable to sign out this device. Please try again.';
      }
    });
    actions.append(button); row.append(deviceIcon(mobile), info, actions); return row;
  }
  async function loadSessions() {
    sessions.setAttribute('aria-busy', 'true');
    try {
      const [response, current] = await Promise.all([
        fetch('/api/auth/list-sessions', requestOptions),
        fetch('/api/auth/get-session', requestOptions).then(response => response.ok ? response.json() : null).catch(() => null),
      ]);
      if (!response.ok) throw new Error('Unable to load signed-in devices.');
      const items = await response.json();
      if (!Array.isArray(items)) throw new Error('Invalid session list.');
      const currentToken = current?.session?.token;
      const ordered = [...items].sort((a, b) => Number(b.token === currentToken) - Number(a.token === currentToken));
      sessions.replaceChildren(...ordered.map(item => sessionRow(item, currentToken)));
      if (count) count.textContent = `${items.length} ${items.length === 1 ? 'session' : 'sessions'}`;
      if (!items.length) sessions.append(element('p', 'account-session-status', 'No signed-in devices.'));
    } catch {
      if (count) count.textContent = '';
      const status = element('div', 'account-session-status'); status.setAttribute('role', 'status');
      status.append(element('p', '', 'Your devices couldn’t be loaded.'));
      const retry = element('button', 'account-button', 'Try again'); retry.type = 'button';
      retry.addEventListener('click', () => { retry.disabled = true; void loadSessions(); });
      status.append(retry); sessions.replaceChildren(status);
    } finally { sessions.setAttribute('aria-busy', 'false'); }
  }
  void loadSessions();
})();
