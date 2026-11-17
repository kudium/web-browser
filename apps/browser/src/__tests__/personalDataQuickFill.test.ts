import { installPersonalDataAutofill } from '../browser/personalDataAutofill';
import { personalDataMatching } from '../browser/personalDataMatching';

const flush = async () => { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); };

it.each([
  ['empty vault', [], false],
  ['empty login', [{ kind: 'login', canFillLogin: false, fields: [] }], false],
  ['unrelated fields', [{ kind: 'profile', fields: [{ name: 'tel' }] }], false],
  ['ambiguous fields', [{ kind: 'profile', fields: [{ name: 'email' }, { name: 'email' }] }], false],
  ['matching profile', [{ kind: 'profile', fields: [{ name: 'email' }] }], true],
  ['matching login', [{ kind: 'login', fields: [] }], true],
] as const)('shows the form shortcut only when usable: %s', async (_label, records, expected) => {
  let shadow!: ShadowRoot;
  const original = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = original.call(this, init); return shadow;
  });
  const callbacks: Record<string, Function> = {};
  let available: unknown = records;
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel.endsWith('enabled')) return true;
    if (channel === 'personal-data-autofill-availability') return available;
    return null;
  }), on: jest.fn((channel, callback) => { callbacks[channel] = callback; }) };
  document.body.innerHTML = '<form><input type="email" autocomplete="email"><input type="password"></form>';
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  fields.forEach((input) => { input.getClientRects = () => [{}] as any; });
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await flush(); fields[0].focus();
    expect(shadow.querySelector('.quick-fill')).toBeNull();
    await flush();
    expect(!!shadow.querySelector('.quick-fill')).toBe(expected);
    expect(shadow.querySelector('.trigger')).not.toBeNull();
    expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-autofill-records');
    available = [];
    callbacks['personal-data-autofill-enabled']({}, true);
    await flush();
    expect(shadow.querySelector('.quick-fill')).toBeNull();
  } finally { dispose(); attach.mockRestore(); document.body.innerHTML = ''; }
});

it.each(['signup', 'ambiguous login', 'failed check', 'stale check'])('hides unavailable shortcuts for %s', async (mode) => {
  let shadow!: ShadowRoot;
  const original = HTMLElement.prototype.attachShadow;
  const attach = jest.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (this: HTMLElement, init) {
    shadow = original.call(this, init); return shadow;
  });
  let release!: (value: unknown) => void;
  const waiting = new Promise((resolve) => { release = resolve; });
  const bridge = { invoke: jest.fn(async (channel: string) => {
    if (channel.endsWith('enabled')) return true;
    if (channel === 'personal-data-autofill-availability') {
      if (mode === 'failed check') throw new Error('Locked');
      if (mode === 'stale check') return waiting;
      return [{ kind: 'login', fields: [] }];
    }
    return null;
  }), on: jest.fn() };
  document.body.innerHTML = `<form><input type="email"><input type="password" ${mode === 'signup' ? 'autocomplete="new-password"' : ''}>${mode === 'ambiguous login' ? '<input type="password">' : ''}</form><input type="email" id="outside">`;
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  fields.forEach((input) => { input.getClientRects = () => [{}] as any; });
  const dispose = installPersonalDataAutofill(bridge, personalDataMatching.score);
  try {
    await flush(); fields[0].focus();
    if (mode === 'stale check') { fields[fields.length - 1].focus(); release([{ kind: 'login', fields: [] }]); }
    await flush();
    expect(shadow.querySelector('.quick-fill')).toBeNull();
    expect(shadow.querySelector('.trigger')).not.toBeNull();
  } finally { dispose(); attach.mockRestore(); document.body.innerHTML = ''; }
});
