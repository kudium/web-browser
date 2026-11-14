import { installPersonalDataAutofill } from '../browser/personalDataAutofill';
import { personalDataMatching } from '../browser/personalDataMatching';
import { defaultPreferences } from '../browser/preferences';

it('defaults the field picker to enabled', () => {
  expect(defaultPreferences.personalDataAutofill).toBe(true);
});

it('offers autofill on matching fields and passwords, and removes it when disabled', async () => {
  const callbacks: Record<string, Function> = {};
  const bridge = {
    invoke: jest.fn(async () => true),
    on: jest.fn((channel, callback) => { callbacks[channel] = callback; }),
  };
  document.body.innerHTML = '<input autocomplete="email" type="email"><input type="password">';
  const email = document.querySelector<HTMLInputElement>('input[type=email]')!;
  const password = document.querySelector<HTMLInputElement>('input[type=password]')!;
  email.getClientRects = () => [{ width: 200, height: 30 }] as any;
  password.getClientRects = email.getClientRects;
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  await Promise.resolve();
  email.focus();
  expect(document.documentElement.querySelector('div[style*="2147483647"]')).not.toBeNull();
  expect(bridge.invoke).toHaveBeenCalledTimes(2);
  expect(email.value).toBe('');
  password.focus();
  expect(document.documentElement.querySelector('div[style*="2147483647"]')).not.toBeNull();
  email.focus();
  callbacks['personal-data-autofill-enabled']({}, false);
  expect(document.documentElement.querySelector('div[style*="2147483647"]')).toBeNull();
  password.focus(); email.focus();
  expect(document.documentElement.querySelector('div[style*="2147483647"]')).toBeNull();
  dispose();
  document.body.innerHTML = '';
});

it.each(['picker', 'quick', 'chooser', 'timeout'])('fills a form with secrets through %s after authentication and Retry', async (mode) => {
  if (mode === 'timeout') jest.useFakeTimers();
  let hostKey: Function | undefined;
  const nativeHostOn = EventTarget.prototype.addEventListener;
  Object.defineProperty(HTMLDivElement.prototype, 'addEventListener', { configurable: true, writable: true, value: nativeHostOn });
  const hostOn = jest.spyOn(HTMLDivElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLElement, type: string, callback: any, options?: any) {
    if (this instanceof HTMLDivElement && type === 'keydown') hostKey = callback;
    nativeHostOn.call(this, type, callback, options);
  });
  let shadow: ShadowRoot | undefined;
  const originalAttach = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = originalAttach.call(this, init);
    return shadow;
  });
  const clicks = new Map<EventTarget, Function>();
  const originalOn = HTMLButtonElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLButtonElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLButtonElement, type: string, listener: any, options?: any) {
    if (type === 'click') clicks.set(this, listener);
    originalOn.call(this, type, listener, options);
  });
  const records = [{ id: 'work', title: 'Work', website: true, fields: [
    { name: 'email', value: 'work@example.com', secret: false },
    { name: 'given-name', value: 'Sam', secret: false },
    { name: 'Password', value: '', secret: true, fieldIndex: 2 },
  ] }];
  const callbacks: Record<string, Function> = {};
  let releaseRecords!: (value: typeof records) => void;
  const waitingRecords = new Promise<typeof records>((resolve) => { releaseRecords = resolve; });
  let attempts = 0;
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel.endsWith('enabled')) return true;
    if (channel === 'personal-data-autofill-position') return null;
    if (channel === 'personal-data-autofill-secret') return 'protected-password';
    if (++attempts === 1) {
      if (mode === 'timeout') return new Promise(() => {});
      throw new Error('Authentication cancelled');
    }
    return waitingRecords;
  }),
    on: jest.fn((channel, callback) => { callbacks[channel] = callback; }) };
  document.body.innerHTML = '<div role="dialog"><form><input type="email" autocomplete="email"><input autocomplete="given-name"><input type="password"></form></div>';
  const form = document.querySelector('form')!;
  const submit = jest.fn(); form.addEventListener('submit', submit);
  const email = form.querySelector<HTMLInputElement>('input[type=email]')!;
  const name = form.querySelector<HTMLInputElement>('input[autocomplete=given-name]')!;
  const password = form.querySelector<HTMLInputElement>('input[type=password]')!;
  for (const input of [email, name, password]) input.getClientRects = () => [{ width: 200, height: 30 }] as any;
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await Promise.resolve(); email.focus();
    expect(shadow!.host.closest('[role=dialog]')).not.toBeNull();
    const outside = jest.fn(); document.addEventListener('click', outside);
    shadow!.querySelector('.trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(outside).not.toHaveBeenCalled(); document.removeEventListener('click', outside);
    const trigger = shadow!.querySelector(mode === 'picker' ? '.trigger' : '.quick-fill')!;
    clicks.get(trigger)!({ isTrusted: true });
    await Promise.resolve(); await Promise.resolve();
    if (mode === 'timeout') {
      jest.advanceTimersByTime(15000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(shadow!.querySelector('.message-error')?.textContent).toBe('Personal Data took too long to respond. Try again.');
    }
    const retry = Array.from(shadow!.querySelectorAll('button')).find((button) => button.textContent === 'Retry')!;
    expect(retry).toBeDefined();
    const opening = clicks.get(retry)!({ isTrusted: true });
    expect(attempts).toBe(2);
    expect(shadow!.querySelector('.message-error')).toBeNull();
    callbacks['personal-data-autofill-authenticating']({}, true);
    expect(shadow!.querySelector('.loading span')?.textContent).toBe('Waiting for authentication…');
    callbacks['personal-data-autofill-authenticating']({}, false);
    expect(shadow!.querySelector('.loading span')?.textContent).toBe('Loading Personal Data…');
    releaseRecords(mode === 'chooser' ? [...records, { ...records[0], id: 'other', title: 'Other' }] : [...records, { ...records[0], id: 'general', website: false }]);
    await opening; for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    if (mode !== 'quick' && mode !== 'timeout') {
      expect(email.value).toBe('');
      const fill = Array.from(shadow!.querySelectorAll<HTMLButtonElement>('.panel button')).find((button) => button.textContent === (mode === 'chooser' ? 'Work' : 'Fill this form'))!;
      if (mode === 'picker') expect(fill.parentElement?.className).toBe('heading');
      if (mode === 'picker') {
        const key = (value: string) => hostKey!({ isTrusted: true, key: value, preventDefault: jest.fn(), stopPropagation: jest.fn() });
        key('Home');
        expect(shadow!.activeElement).not.toBeNull();
        key('End');
        key('ArrowUp'); key('ArrowDown');
        fill.focus(); key('Enter');
      } else clicks.get(fill)!({ isTrusted: true });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    }
    expect(email.value).toBe('work@example.com');
    expect(name.value).toBe('Sam');
    expect(password.value).toBe('protected-password');
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-secret', { id: 'work', fieldIndex: 2 });
    expect(submit).not.toHaveBeenCalled();
  } finally {
    dispose(); attach.mockRestore(); on.mockRestore(); hostOn.mockRestore(); delete (HTMLDivElement.prototype as any).addEventListener;
    if (mode === 'timeout') jest.useRealTimers();
    window.dispatchEvent(new Event('pagehide'));
    document.body.innerHTML = '';
  }
});

it.each(['Hide for now', 'Disable for this website', 'Close Personal Data'])('generates and explicitly saves a password, then supports %s', async (action) => {
  let shadow: ShadowRoot | undefined;
  const attachOriginal = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = attachOriginal.call(this, init); return shadow;
  });
  const clicks = new Map<EventTarget, Function>();
  const onOriginal = HTMLButtonElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLButtonElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLButtonElement, type: string, listener: any, options?: any) {
    if (type === 'click') clicks.set(this, listener);
    onOriginal.call(this, type, listener, options);
  });
  const callbacks: Record<string, Function> = {};
  const bridge = { invoke: jest.fn(async (channel: string, _input?: any) => channel.endsWith('enabled') ? true : channel === 'personal-data-autofill-secret' ? 'saved-secret-value' : [{ id: 'work', kind: 'profile', title: 'Work', fields: [{ name: 'API key', secret: true, value: '', fieldIndex: 2 }] }]), on: jest.fn((channel, callback) => { callbacks[channel] = callback; }) };
  document.body.innerHTML = '<form><input type="email" value="sam@example.com"><input type="password" autocomplete="new-password"><input type="password" name="confirm" autocomplete="new-password"></form>';
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  fields.forEach((input) => { input.getClientRects = () => [{ width: 200, height: 30 }] as any; });
  const click = async (text: string) => {
    const button = Array.from(shadow!.querySelectorAll('button')).find((entry) => entry.textContent === text || entry.getAttribute('aria-label') === text)!;
    clicks.get(button)!({ isTrusted: true });
    await Promise.resolve(); await Promise.resolve();
  };
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await Promise.resolve(); fields[1].focus();
    clicks.get(shadow!.querySelector('button')!)!({ isTrusted: true });
    await Promise.resolve(); await Promise.resolve();
    expect(fields[1].value).toBe('');
    expect(shadow!.querySelector('.panel > div:not(.header) button')?.textContent).toBe('Generate strong password');
    expect(shadow!.querySelector('.panel')?.textContent).not.toContain('saved-secret-value');
    await click('Fill API key');
    expect(fields[1].value).toBe('saved-secret-value');
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-secret', { id: 'work', fieldIndex: 2 });
    fields[0].focus(); fields[1].focus();
    clicks.get(shadow!.querySelector('button')!)!({ isTrusted: true });
    await Promise.resolve(); await Promise.resolve();
    await click('Generate strong password');
    const prompt = shadow!.querySelector('.message');
    expect(prompt?.textContent).toBe('Strong password filled. Save it to Personal Data?');
    expect(prompt?.getAttribute('role')).toBe('status');
    expect(Array.from(prompt!.parentElement!.childNodes).every((node) => node.nodeType === Node.ELEMENT_NODE)).toBe(true);
    expect(fields[1].value).toHaveLength(20);
    expect(fields[1].value).toMatch(/[A-Z]/);
    expect(fields[1].value).toMatch(/[a-z]/);
    expect(fields[1].value).toMatch(/[0-9]/);
    expect(fields[2].value).toBe(fields[1].value);
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-autofill-save-password', expect.anything());
    await click('Save password');
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-save-password', { username: 'sam@example.com', password: fields[1].value });
    expect(shadow!.querySelector('.message-success')?.textContent).toBe('Password saved.');
    expect(shadow!.querySelector('[aria-label="Personal Data options"]')).toBeNull();
    expect(shadow!.querySelector('.header [aria-label="Manage Personal Data"]')).not.toBeNull();
    expect(shadow!.querySelector('.header [aria-label="Save input for this website"]')).not.toBeNull();
    await click('Save input for this website');
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-save-field', { name: 'Password', aliases: [], value: fields[1].value, secret: true });
    expect(shadow!.querySelector('.save-feedback')?.textContent).toContain('Input saved for this website.');
    await click('Back');
    expect(shadow!.querySelector('.header .close')).not.toBeNull();
    if (action !== 'Close Personal Data') expect(Array.from(shadow!.querySelectorAll('button')).some((entry) => entry.textContent === action)).toBe(false);
    await click('Close Personal Data');
    expect(shadow!.querySelector('.dismissal')).not.toBeNull();
    await click('Cancel');
    expect(shadow!.querySelector('.dismissal')).toBeNull();
    expect(shadow!.querySelector('.panel')?.textContent).toContain('Password saved.');
    await click('Close Personal Data');
    await click(action);
    if (action === 'Disable for this website') expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-disable-site');
    fields[0].focus(); fields[1].focus();
    expect(document.documentElement.querySelector('div[style*="2147483647"]')).toBeNull();
    callbacks['personal-data-autofill-enabled']({}, true);
    expect(document.documentElement.querySelector('div[style*="2147483647"]')).toBeNull();
  } finally {
    dispose(); attach.mockRestore(); on.mockRestore(); window.dispatchEvent(new Event('pagehide')); document.body.innerHTML = '';
  }
});


it.each([[false, 'submit'], [true, 'submit'], [false, 'click'], [false, 'enter'], [false, 'redirect'], [false, 'multi']] as const)('suggests saving and confirms updates: %s via %s', async (updating, method) => {
  jest.useFakeTimers();
  let shadow: ShadowRoot | undefined;
  let submit: Function | undefined;
  const documentHandlers: Record<string, Function> = {};
  const attachOriginal = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = attachOriginal.call(this, init); return shadow;
  });
  const documentOn = document.addEventListener.bind(document);
  const listener = jest.spyOn(document, 'addEventListener').mockImplementation((type: any, callback: any, options: any) => {
    if (type === 'submit') submit = callback;
    if (options === true) documentHandlers[type] = callback;
    documentOn(type, callback, options);
  });
  const clicks = new Map<EventTarget, Function>();
  const buttonOn = HTMLButtonElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLButtonElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLButtonElement, type: string, callback: any, options?: any) {
    if (type === 'click') clicks.set(this, callback);
    buttonOn.call(this, type, callback, options);
  });
  const bridge = { invoke: jest.fn(async (channel: string, input?: any) => channel === 'personal-data-login-save'
    ? updating && !input?.confirmUpdate ? { needsUpdate: true } : { saved: true, updated: updating }
    : channel === 'personal-data-login-pending' ? { pending: true, navigated: method === 'redirect' } : true), on: jest.fn() };
  document.body.innerHTML = '<form><input type="email" value="sam@example.com"><input type="password" value="existing-password"></form>';
  const form = document.querySelector('form')!;
  Array.from(form.querySelectorAll('input')).forEach((input) => { input.getClientRects = () => [{ width: 200, height: 30 }] as any; });
  let dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await Promise.resolve();
    submit!({ isTrusted: false, target: form });
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-login-candidate', expect.anything());
    if (method === 'click') {
      const login = document.createElement('button'); login.type = 'button'; login.textContent = 'Sign in'; form.append(login);
      documentHandlers.click({ isTrusted: true, target: login });
    } else if (method === 'enter') {
      documentHandlers.keydown({ isTrusted: true, key: 'Enter', target: form.querySelector('input[type=password]') });
    } else if (method === 'multi') {
      const secret = form.querySelector<HTMLInputElement>('input[type=password]')!;
      secret.value = '';
      submit!({ isTrusted: true, target: form });
      expect(bridge.invoke).toHaveBeenCalledWith('personal-data-login-identity', { username: 'sam@example.com' });
      form.querySelector('input[type=email]')!.remove(); secret.value = 'existing-password';
      submit!({ isTrusted: true, target: form });
    } else submit!({ isTrusted: true, target: form });
    await Promise.resolve(); await Promise.resolve();
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-login-candidate', { username: method === 'multi' ? '' : 'sam@example.com', password: 'existing-password' });
    jest.advanceTimersByTime(1000); await Promise.resolve();
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-login-pending');
    document.body.innerHTML = method === 'submit' ? '<button>Log out</button>' : '<button>My account</button>';
    document.querySelector('button')!.getClientRects = () => [{ width: 100, height: 30 }] as any;
    if (method === 'redirect') {
      dispose(); dispose = installPersonalDataAutofill(bridge, personalDataMatching.score); await Promise.resolve();
    }
    // MFA, active loading, and delayed errors must not look like successful login.
    for (const markup of ['<input autocomplete="one-time-code">', '<div aria-busy="true"></div>', '<div role="alert">Incorrect login. Try again</div>']) {
      const blocker = document.createElement('div'); blocker.innerHTML = markup; document.body.append(blocker);
      blocker.firstElementChild!.getClientRects = () => [{ width: 100, height: 30 }] as any;
      for (let tick = 0; tick < 4; tick++) { jest.advanceTimersByTime(500); await Promise.resolve(); await Promise.resolve(); }
      expect(shadow?.querySelector('[aria-label="Save website login"]')).toBeFalsy();
      blocker.remove();
    }
    for (let tick = 0; tick < 3; tick++) { jest.advanceTimersByTime(1000); await Promise.resolve(); await Promise.resolve(); }
    expect(shadow!.querySelector('[aria-label="Save website login"]')).not.toBeNull();
    document.querySelector('button')!.focus(); window.dispatchEvent(new Event('scroll'));
    expect(shadow!.querySelector('[aria-label="Save website login"]')).not.toBeNull();
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-login-save');
    const save = Array.from(shadow!.querySelectorAll('button')).find((button) => button.textContent === 'Save login')!;
    clicks.get(save)!({ isTrusted: true }); await Promise.resolve(); await Promise.resolve();
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-login-save');
    if (updating) {
      expect(shadow!.querySelector('.message-success')).toBeNull();
      const update = Array.from(shadow!.querySelectorAll('button')).find((button) => button.textContent === 'Update existing data')!;
      clicks.get(update)!({ isTrusted: true });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(bridge.invoke).toHaveBeenCalledWith('personal-data-login-save', { confirmUpdate: true });
    }
    expect(shadow!.querySelector('.message-success')?.textContent).toBe(updating ? 'Website login updated.' : 'Login saved for this website.');
  } finally {
    dispose(); attach.mockRestore(); listener.mockRestore(); on.mockRestore(); jest.useRealTimers(); document.body.innerHTML = '';
  }
});

it('drags around an input, remembers its website placement, and suppresses the drag click', async () => {
  let shadow: ShadowRoot | undefined;
  const originalAttach = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = originalAttach.call(this, init); return shadow;
  });
  const handlers = new Map<EventTarget, Record<string, Function>>();
  const originalOn = HTMLButtonElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLButtonElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLButtonElement, type: string, callback: any, options?: any) {
    handlers.set(this, { ...handlers.get(this), [type]: callback }); originalOn.call(this, type, callback, options);
  });
  let saved: any = null;
  const bridge = { invoke: jest.fn(async (channel: string, value?: any) => {
    if (channel === 'personal-data-autofill-position') { if (value) saved = value; return saved; }
    return channel.endsWith('enabled') ? true : [];
  }), on: jest.fn() };
  document.body.innerHTML = '<input type="email"><input type="email">';
  const inputs = Array.from(document.querySelectorAll('input'));
  inputs.forEach((input, index) => {
    input.getClientRects = () => [{ width: 200, height: 30 }] as any;
    input.getBoundingClientRect = () => ({ left: 100, right: 300, top: 100 + index * 60, bottom: 130 + index * 60, width: 200, height: 30 }) as DOMRect;
  });
  let dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await Promise.resolve(); inputs[0].focus();
    const trigger = shadow!.querySelector('button')!;
    trigger.setPointerCapture = jest.fn(); trigger.hasPointerCapture = () => false;
    const events = handlers.get(trigger)!;
    events.pointerdown({ isTrusted: true, button: 0, pointerId: 1, clientX: 280, clientY: 115, preventDefault() {} });
    events.pointermove({ isTrusted: true, pointerId: 1, clientX: 66, clientY: 115 });
    events.pointerup({ isTrusted: true, pointerId: 1 });
    expect(saved).toEqual({ side: 'left', x: -44, y: -13 });
    events.click({ isTrusted: true });
    expect(shadow!.querySelector('.panel')).toBeNull();
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-autofill-records');
    inputs[1].focus();
    expect((shadow!.host as HTMLElement).style.left).toBe('56px');
    expect((shadow!.host as HTMLElement).style.top).toBe('162px');
    dispose();
    dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
    await Promise.resolve(); await Promise.resolve();
    expect((shadow!.host as HTMLElement).style.left).toBe('56px');
    expect((shadow!.host as HTMLElement).style.top).toBe('162px');
  } finally { dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = ''; }
});

it('browses unmatched saved values and fills only the focused field', async () => {
  let shadow!: ShadowRoot;
  const originalAttach = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = originalAttach.call(this, init); return shadow;
  });
  const clicks = new Map<EventTarget, Function>();
  const originalOn = HTMLButtonElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLButtonElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLButtonElement, type: string, listener: any, options?: any) {
    if (type === 'click') clicks.set(this, listener);
    originalOn.call(this, type, listener, options);
  });
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel.endsWith('enabled')) return true;
    if (channel.endsWith('position')) return null;
    return [{ id: 'personal', kind: 'profile', title: 'Personal profile', fields: [
      { name: 'Nickname', value: 'Samson', secret: false },
      { name: 'City', value: 'Toronto', secret: false },
      { name: 'Password', value: 'hidden-secret', secret: true, fieldIndex: 2 },
    ] }];
  }), on: jest.fn() };
  document.body.innerHTML = '<form><input autocomplete="given-name"><input autocomplete="address-level2"></form>';
  const inputs = Array.from(document.querySelectorAll('input'));
  inputs.forEach((input) => { input.getClientRects = () => [{ width: 200, height: 30 }] as any; });
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  const click = (label: string) => {
    const entry = Array.from(shadow.querySelectorAll('button')).find((item) => item.textContent === label || item.getAttribute('aria-label') === label)!;
    clicks.get(entry)!({ isTrusted: true });
  };
  try {
    await Promise.resolve(); inputs[0].focus();
    clicks.get(shadow.querySelector('.trigger')!)!({ isTrusted: true });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(shadow.textContent).toContain('No suggested matches for this field.');
    click('Browse saved data');
    expect(shadow.textContent).toContain('Personal profile');
    expect(shadow.textContent).not.toContain('hidden-secret');
    const search = shadow.querySelector<HTMLInputElement>('.saved-search')!;
    search.value = 'Toronto'; search.dispatchEvent(new Event('input'));
    expect(shadow.textContent).toContain('Toronto'); expect(shadow.textContent).not.toContain('Samson');
    search.value = 'missing'; search.dispatchEvent(new Event('input'));
    expect(shadow.textContent).toContain('No saved data matches your search.');
    search.value = 'personal'; search.dispatchEvent(new Event('input'));
    click('Fill Nickname: Samson');
    expect(inputs[0].value).toBe('Samson'); expect(inputs[1].value).toBe('');
    expect(shadow.querySelector('.panel')).toBeNull();
  } finally { dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = ''; }
});
