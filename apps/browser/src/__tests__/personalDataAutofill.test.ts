import { installPersonalDataAutofill } from '../browser/personalDataAutofill';
import { personalDataMatching } from '../browser/personalDataMatching';
import { defaultPreferences } from '../browser/preferences';

const settle = async () => { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); };

it('defaults the field picker to enabled', () => {
  expect(defaultPreferences.personalDataAutofill).toBe(true);
});

it('saves a named password with its form account and explains a failed save before retry', async () => {
  let shadow!: ShadowRoot;
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
  let attempts = 0;
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel === 'personal-data-autofill-focus') return false;
    if (channel.endsWith('enabled')) return true;
    if (channel === 'personal-data-autofill-records') return [];
    if (channel === 'personal-data-autofill-save-field') {
      if (++attempts < 3) throw new Error("Error invoking remote method: Choose an account before saving website data.");
      return { saved: true };
    }
    return null;
  }), on: jest.fn() };
  document.body.innerHTML = '<form><input type="email" value="second@example.com"><input type="password" name="login-secret" aria-label="Account password" value="existing-secret"></form>';
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  inputs.forEach((input) => { input.getClientRects = () => [{}] as any; });
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  const click = async (selector: string) => {
    clicks.get(shadow.querySelector(selector)!)!({ isTrusted: true });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  };
  try {
    await settle(); inputs[1].focus();
    await click('.trigger');
    await click('[aria-label="Save input for this website"]');
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-save-field', {
      name: 'Password', aliases: ['login-secret', 'Account password'], value: 'existing-secret', secret: true, username: 'second@example.com',
    });
    expect(shadow.querySelector('[role=alert]')?.textContent).toBe('Choose or fill your username first, then save the password again.');
    await click('[aria-label="Save input for this website"]');
    expect(shadow.querySelectorAll('[role=alert]')).toHaveLength(1);
    await click('[aria-label="Save input for this website"]');
    expect(shadow.querySelector('.save-feedback')?.textContent).toContain('Input saved for this website.');
    expect(inputs[1].value).toBe('existing-secret');
  } finally {
    dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = '';
  }
});

it('offers autofill on matching fields and passwords, and removes it when disabled', async () => {
  const callbacks: Record<string, Function> = {};
  const bridge = {
    invoke: jest.fn(async (channel: string) => channel.endsWith('enabled')),
    on: jest.fn((channel, callback) => { callbacks[channel] = callback; }),
  };
  document.body.innerHTML = '<input autocomplete="email" type="email"><input type="password">';
  const email = document.querySelector<HTMLInputElement>('input[type=email]')!;
  const password = document.querySelector<HTMLInputElement>('input[type=password]')!;
  email.getClientRects = () => [{ width: 200, height: 30 }] as any;
  password.getClientRects = email.getClientRects;
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  await settle();
  email.focus();
  expect(document.documentElement.querySelector('div[style*="2147483647"]')).not.toBeNull();
  expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-enabled');
  expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-focus');
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

it.each(['picker', 'quick', 'chooser', 'timeout', 'suggestion', 'password suggestion'])('fills a form with secrets through %s after authentication and Retry', async (mode) => {
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
    if (channel === 'personal-data-autofill-focus') return false;
    if (channel.endsWith('enabled')) return true;
    if (channel === 'personal-data-autofill-position') return null;
    if (channel === 'personal-data-autofill-secret') return 'protected-password';
    if (channel === 'personal-data-autofill-availability') return records;
    if (channel !== 'personal-data-autofill-records') return null;
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
    await settle(); (mode === 'password suggestion' ? password : email).focus();
    await settle(); await settle();
    expect(shadow!.host.closest('[role=dialog]')).not.toBeNull();
    const outside = jest.fn(); document.addEventListener('click', outside);
    shadow!.querySelector('.trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(outside).not.toHaveBeenCalled(); document.removeEventListener('click', outside);
    const trigger = shadow!.querySelector(['picker', 'suggestion', 'password suggestion'].includes(mode) ? '.trigger' : '.quick-fill')!;
    clicks.get(trigger)!({ isTrusted: true });
    await settle(); await settle();
    if (mode === 'timeout') {
      jest.advanceTimersByTime(15000); await settle(); await settle(); await settle();
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
      const fill = Array.from(shadow!.querySelectorAll<HTMLButtonElement>('.panel button')).find((button) => mode === 'suggestion' ? button.getAttribute('aria-label') === 'Fill email: work@example.com' : button.textContent === (mode === 'chooser' ? 'Work' : mode === 'password suggestion' ? 'Fill form · Password' : 'Fill this form'))!;
      if (mode === 'picker') expect(fill.parentElement?.className).toBe('heading');
      if (mode === 'picker') {
        const key = (value: string) => hostKey!({ isTrusted: true, key: value, preventDefault: jest.fn(), stopPropagation: jest.fn() });
        key('Home');
        expect(shadow!.activeElement).not.toBeNull();
        key('End');
        key('ArrowUp'); key('ArrowDown');
        fill.focus(); key('Enter');
      } else clicks.get(fill)!({ isTrusted: true });
      await settle(); await settle(); await settle();
    }
    expect(email.value).toBe('work@example.com');
    expect(name.value).toBe(mode === 'suggestion' ? '' : 'Sam');
    expect(password.value).toBe(mode === 'suggestion' ? '' : 'protected-password');
    if (mode === 'suggestion') expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-autofill-secret', expect.anything());
    else expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-secret', { id: 'work', fieldIndex: 2 });
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
  const bridge = { invoke: jest.fn(async (channel: string, _input?: any) => channel === 'personal-data-autofill-focus' ? false : channel.endsWith('enabled') ? true : channel === 'personal-data-autofill-secret' ? 'saved-secret-value' : [{ id: 'work', kind: 'profile', title: 'Work', fields: [{ name: 'API key', secret: true, value: '', fieldIndex: 2 }] }]), on: jest.fn((channel, callback) => { callbacks[channel] = callback; }) };
  document.body.innerHTML = '<form><input type="email" value="sam@example.com"><input type="password" autocomplete="new-password"><input type="password" name="confirm" autocomplete="new-password"></form>';
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  fields.forEach((input) => { input.getClientRects = () => [{ width: 200, height: 30 }] as any; });
  const click = async (text: string) => {
    const button = Array.from(shadow!.querySelectorAll('button')).find((entry) => entry.textContent === text || entry.getAttribute('aria-label') === text)!;
    clicks.get(button)!({ isTrusted: true });
    await settle(); await settle();
  };
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await settle(); fields[1].focus();
    clicks.get(shadow!.querySelector('button')!)!({ isTrusted: true });
    await settle(); await settle();
    expect(fields[1].value).toBe('');
    expect(Array.from(shadow!.querySelectorAll('.panel button')).some(button => button.textContent === 'Generate strong password')).toBe(true);
    expect(shadow!.querySelector('.panel')?.textContent).not.toContain('saved-secret-value');
    await click('Fill API key');
    expect(fields[1].value).toBe('saved-secret-value');
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-secret', { id: 'work', fieldIndex: 2 });
    fields[0].focus(); fields[1].focus();
    clicks.get(shadow!.querySelector('button')!)!({ isTrusted: true });
    await settle(); await settle();
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
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-save-field', { name: 'Password', aliases: [], value: fields[1].value, secret: true, username: 'sam@example.com' });
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
  const bridge = { invoke: jest.fn(async (channel: string, input?: any) => channel === 'personal-data-autofill-focus' ? false : channel === 'personal-data-login-save'
    ? updating && !input?.confirmUpdate ? { needsUpdate: true } : { saved: true, updated: updating }
    : channel === 'personal-data-login-pending' ? { pending: true, navigated: method === 'redirect' } : true), on: jest.fn() };
  document.body.innerHTML = '<form><input type="email" value="sam@example.com"><input type="password" value="existing-password"></form>';
  const form = document.querySelector('form')!;
  Array.from(form.querySelectorAll('input')).forEach((input) => { input.getClientRects = () => [{ width: 200, height: 30 }] as any; });
  let dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await settle();
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
    await settle(); await settle();
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-login-candidate', { username: method === 'multi' ? '' : 'sam@example.com', password: 'existing-password' });
    jest.advanceTimersByTime(1000); await settle();
    expect(shadow?.querySelector('[aria-label="Save website login"]') ?? null).toBeNull();
    document.body.innerHTML = method === 'submit' ? '<button>Log out</button>' : '<button>My account</button>';
    document.querySelector('button')!.getClientRects = () => [{ width: 100, height: 30 }] as any;
    if (method === 'redirect') {
      dispose(); dispose = installPersonalDataAutofill(bridge, personalDataMatching.score); await settle();
    }
    // MFA, active loading, and delayed errors must not look like successful login.
    for (const markup of ['<input autocomplete="one-time-code">', '<div aria-busy="true"></div>', '<div role="alert">Incorrect login. Try again</div>']) {
      const blocker = document.createElement('div'); blocker.innerHTML = markup; document.body.append(blocker);
      blocker.firstElementChild!.getClientRects = () => [{ width: 100, height: 30 }] as any;
      for (let tick = 0; tick < 4; tick++) { jest.advanceTimersByTime(500); await settle(); await settle(); }
      expect(shadow?.querySelector('[aria-label="Save website login"]')).toBeFalsy();
      blocker.remove();
    }
    for (let tick = 0; tick < 3; tick++) { jest.advanceTimersByTime(1000); await settle(); await settle(); }
    expect(shadow!.querySelector('[aria-label="Save website login"]')).not.toBeNull();
    document.querySelector('button')!.focus(); window.dispatchEvent(new Event('scroll'));
    expect(shadow!.querySelector('[aria-label="Save website login"]')).not.toBeNull();
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-login-save');
    const save = Array.from(shadow!.querySelectorAll('button')).find((button) => button.textContent === 'Save login')!;
    clicks.get(save)!({ isTrusted: true }); await settle(); await settle();
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-login-save');
    if (updating) {
      expect(shadow!.querySelector('.message-success')).toBeNull();
      const update = Array.from(shadow!.querySelectorAll('button')).find((button) => button.textContent === 'Update existing data')!;
      clicks.get(update)!({ isTrusted: true });
      await settle(); await settle(); await settle();
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
    if (channel === 'personal-data-autofill-focus') return false;
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
    await settle(); inputs[0].focus();
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
    await settle(); await settle();
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
    if (channel === 'personal-data-autofill-focus') return false;
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
    await settle(); inputs[0].focus();
    clicks.get(shadow.querySelector('.trigger')!)!({ isTrusted: true });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(shadow.textContent).toContain('No suggested matches for this field.');
    click('Browse saved data');
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
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
    expect(shadow.host.isConnected).toBe(false);
  } finally { dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = ''; }
});

it.each(['profile email', 'duplicate email', 'conflicting emails', 'existing email', 'login record'])('supplements a preferred record with saved email through the lightning button: %s', async (mode) => {
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
  const profile = { id: 'profile', kind: 'profile', title: 'Personal', fields: [{ name: 'Email', value: 'saved@example.com', secret: false }] };
  const records = [
    { id: 'account', kind: mode === 'login record' ? 'login' : 'knowledge', selected: true, website: true, title: 'Account', fields: [{ name: 'Password', value: '', secret: true, fieldIndex: 0 }] },
    profile,
    ...(mode === 'duplicate email' || mode === 'conflicting emails' ? [{ ...profile, id: 'other-profile', fields: [{ name: 'Email', value: mode === 'duplicate email' ? 'saved@example.com' : 'other@example.com', secret: false }] }] : []),
    { id: 'other-login', kind: 'login', title: 'Another account', fields: [{ name: 'Email', value: 'wrong-account@example.com', secret: false }] },
  ];
  document.body.innerHTML = '<form><input name="email" type="email" autocomplete="email"><input type="password" autocomplete="current-password"><input name="email" type="hidden" value="hidden"><input name="email" readonly value="readonly"></form><form><input type="email" value="other-form@example.com"></form>';
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  inputs.forEach((input) => { input.getClientRects = () => [{}] as any; });
  const submit = jest.fn(); document.querySelector('form')!.addEventListener('submit', submit);
  if (mode === 'existing email') inputs[0].value = 'typed@example.com';
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel === 'personal-data-autofill-focus') return false;
    if (channel.endsWith('enabled')) return true;
    if (channel === 'personal-data-autofill-records' || channel === 'personal-data-autofill-availability') return records;
    if (channel === 'personal-data-autofill-secret') return 'account-password';
    if (channel === 'personal-data-autofill-login') { inputs[1].value = 'account-password'; return { filled: 1 }; }
    return null;
  }), on: jest.fn() };
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  const flush = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };
  try {
    await flush(); inputs[1].focus(); await flush();
    clicks.get(shadow.querySelector('.quick-fill')!)!({ isTrusted: true });
    await flush();
    expect(inputs[1].value).toBe('account-password');
    if (mode === 'conflicting emails') {
      expect(inputs[0].value).toBe('');
      expect(shadow.textContent).toContain('Choose a saved value');
      expect(shadow.textContent).not.toContain('wrong-account@example.com');
      const chosen = Array.from(shadow.querySelectorAll('button')).find((button) => button.textContent === 'saved@example.com')!;
      clicks.get(chosen)!({ isTrusted: true }); await flush();
    }
    expect(inputs[0].value).toBe(mode === 'existing email' ? 'typed@example.com' : 'saved@example.com');
    expect(inputs[2].value).toBe('hidden');
    expect(inputs[3].value).toBe('readonly');
    expect(inputs[4].value).toBe('other-form@example.com');
    expect(submit).not.toHaveBeenCalled();
  } finally { dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = ''; }
});

it('drags the dropdown by its header, clamps it to the viewport, and ignores header buttons', async () => {
  let shadow!: ShadowRoot;
  const originalAttach = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = originalAttach.call(this, init); return shadow;
  });
  const listeners = new Map<EventTarget, Record<string, Function>>();
  const originalOn = HTMLDivElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLDivElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLDivElement, type: string, listener: any, options?: any) {
    const entries = listeners.get(this) || {}; entries[type] = listener; listeners.set(this, entries);
    originalOn.call(this, type, listener, options);
  });
  document.body.innerHTML = '<input type="email" autocomplete="email">';
  const input = document.querySelector<HTMLInputElement>('input')!;
  input.getClientRects = () => [{}] as any;
  const bridge = { invoke: jest.fn(async (channel: string) => channel === 'personal-data-autofill-records' ? [] : true), on: jest.fn() };
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    input.focus();
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    const panel = shadow.querySelector<HTMLDivElement>('.panel')!;
    const header = panel.querySelector<HTMLDivElement>('.header')!;
    panel.getBoundingClientRect = () => ({ left: 20, top: 30, width: 290, height: 200 }) as DOMRect;
    header.setPointerCapture = jest.fn(); header.hasPointerCapture = () => true; header.releasePointerCapture = jest.fn();
    const handlers = listeners.get(header)!;
    const event = { isTrusted: true, button: 0, pointerId: 1, clientX: 30, clientY: 40, target: header, preventDefault: jest.fn() };
    handlers.pointerdown({ ...event, target: header.querySelector('button') });
    expect(header.setPointerCapture).not.toHaveBeenCalled();
    handlers.pointerdown(event);
    handlers.pointermove({ ...event, clientX: 90, clientY: 100 });
    expect(panel.style.left).toBe('80px'); expect(panel.style.top).toBe('90px');
    expect(document.activeElement).toBe(input);
    handlers.pointermove({ ...event, clientX: -1000, clientY: -1000 });
    expect(panel.style.left).toBe('8px'); expect(panel.style.top).toBe('8px');
    handlers.pointercancel(event);
    handlers.pointermove({ ...event, clientX: 90, clientY: 100 });
    expect(panel.style.left).toBe('8px');
    expect(header.releasePointerCapture).toHaveBeenCalledWith(1);
  } finally {
    dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = '';
  }
});

it.each(['empty', 'ambiguous', 'matching'])('offers form filling only for usable %s saved values and keeps the field uncovered', async (mode) => {
  let shadow!: ShadowRoot;
  const original = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = original.call(this, init); return shadow;
  });
  const clicks = new Map<EventTarget, Function>();
  const originalOn = HTMLButtonElement.prototype.addEventListener;
  const on = jest.spyOn(HTMLButtonElement.prototype, 'addEventListener').mockImplementation(function (this: HTMLButtonElement, type: string, listener: any, options?: any) {
    if (type === 'click') clicks.set(this, listener);
    originalOn.call(this, type, listener, options);
  });
  const fields = [{ name: 'Email', value: mode === 'empty' ? '' : 'saved@example.com', secret: false },
    ...(mode === 'ambiguous' ? [{ name: 'Email', value: 'other@example.com', secret: false }] : [])];
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel === 'personal-data-autofill-focus') return true;
    if (channel.endsWith('enabled')) return true;
    if (channel.endsWith('position')) return null;
    return [{ id: 'profile', kind: 'profile', title: 'Profile', fields }];
  }), on: jest.fn() };
  document.body.innerHTML = '<form><input type="email" autocomplete="email"></form>';
  const input = document.querySelector<HTMLInputElement>('input')!;
  input.getClientRects = () => [{}] as any;
  // Near the viewport bottom: the old fixed 320px clamp covered this field.
  input.getBoundingClientRect = () => ({ left: 20, right: 420, top: innerHeight - 100, bottom: innerHeight - 60, width: 400, height: 40 }) as DOMRect;
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await settle(); input.focus(); await settle();
    await settle();
    const panel = shadow.querySelector<HTMLElement>('.panel')!;
    expect(panel.style.bottom).toBe('104px');
    expect(panel.style.top).toBe('auto');
    expect(document.activeElement).toBe(input);
    expect(!!panel.querySelector('.fill-form')).toBe(mode === 'matching');
    expect(!!shadow.querySelector('.quick-fill')).toBe(mode === 'matching');
    if (mode === 'empty') expect(panel.querySelector('[aria-label^="Fill Email:"]')).toBeNull();
  } finally { dispose(); attach.mockRestore(); on.mockRestore(); document.body.innerHTML = ''; }
});

it.each(['pick', 'save', 'fill', 'save-form', 'save-page'] as const)('native Form menu %s works without an automatic picker', async action => {
  let shadow!: ShadowRoot;
  const original = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function(this: HTMLElement, init) {
    shadow = original.call(this, init); return shadow;
  });
  const listeners = new Map<string, Function>();
  const record = { id: 'profile', kind: 'profile', title: 'Personal profile', fields: [{ name: 'Email', aliases: ['email'], value: 'saved@example.com' }] };
  const bridge = { on: jest.fn((channel, callback) => listeners.set(channel, callback)), invoke: jest.fn(async channel => {
    if (channel === 'personal-data-autofill-enabled') return true;
    if (channel === 'personal-data-autofill-focus') return false;
    if (channel === 'personal-data-autofill-records' || channel === 'personal-data-autofill-browse') return [record];
    if (channel === 'personal-data-autofill-save-field') return { saved: true };
    return null;
  }) };
  document.body.innerHTML = `<form><input name="${action === 'fill' ? 'email' : 'unusual-field'}" value="my value"></form>`;
  if (action === 'save-form' || action === 'save-page') document.querySelector('form')!.insertAdjacentHTML('beforeend', '<input type="email" name="email" value="work@example.com"><input type="password" value="example-secret"><input name="empty"><input type="hidden" name="token" value="exclude">');
  if (action === 'save-page') document.body.insertAdjacentHTML('beforeend', '<form><input name="Note" value="Second form"></form>');
  const input = document.querySelector('input')!;
  document.querySelectorAll('input').forEach(field => { field.getClientRects = () => [{}] as any; });
  input.getClientRects = () => [{}] as any;
  const hitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => action === 'save-page' ? document.body : input });
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  await settle();
  expect(shadow).toBeUndefined();
  listeners.get('personal-data-autofill-command')!(null, { action, x: 20, y: 20 });
  await settle(); await settle();
  if (action === 'pick') {
    expect(shadow.querySelector('.saved-search')).not.toBeNull();
    expect(shadow.textContent).toContain('saved@example.com');
    expect(input.value).toBe('my value');
  } else if (action === 'save') {
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-save-field', expect.objectContaining({ value: 'my value' }));
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-autofill-records');
    expect(shadow.textContent).toContain('Input saved for this website.');
  } else if (action === 'save-form' || action === 'save-page') {
    expect(bridge.invoke).toHaveBeenCalledWith('personal-data-autofill-save-field', { fields: [
      { name: 'unusual-field', value: 'my value', secret: false, aliases: ['unusual-field'] },
      { name: 'Email', value: 'work@example.com', secret: false, aliases: ['email'] },
      { name: 'Password', value: 'example-secret', secret: true, aliases: [] },
      ...(action === 'save-page' ? [{ name: 'Note', value: 'Second form', secret: false, aliases: ['Note'] }] : []),
    ] });
    expect(shadow.textContent).toContain('Form values saved for this website.');
  } else {
    expect(input.value).toBe('saved@example.com');
  }
  dispose(); attach.mockRestore();
  if (hitTest) Object.defineProperty(document, 'elementFromPoint', hitTest);
  else delete (document as any).elementFromPoint;
});
