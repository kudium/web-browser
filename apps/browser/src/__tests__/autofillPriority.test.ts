import { installPersonalDataAutofill } from '../browser/personalDataAutofill';
import { personalDataMatching } from '../browser/personalDataMatching';

const flush = async () => {
  for (let turn = 0; turn < 25; turn++) await Promise.resolve();
};
const website = {
  id: 'site',
  kind: 'knowledge',
  title: 'Website account',
  website: true,
  fields: [
    { name: 'email', value: 'website@example.test', secret: false },
    { name: 'Password', value: '', secret: true, fieldIndex: 1 },
  ],
};
const global = {
  id: 'global',
  kind: 'profile',
  title: 'Personal Profile',
  website: false,
  selected: true,
  fields: [{ name: 'email', value: 'global@example.test', secret: false }],
};

it.each([
  'picker',
  'quick',
  'multiple websites',
  'selected website',
  'global fallback',
  'focus disabled',
  'password order',
  'explicit email',
  'explicit username',
])(
  'prioritizes website accounts without losing explicit choices: %s',
  async (mode) => {
    let shadow!: ShadowRoot;
    const originalAttach = HTMLElement.prototype.attachShadow;
    jest
      .spyOn(HTMLElement.prototype, 'attachShadow')
      .mockImplementation(function (this: HTMLElement, init) {
        shadow = originalAttach.call(this, init);
        return shadow;
      });
    const clicks = new Map<EventTarget, EventListener>();
    const originalOn = HTMLButtonElement.prototype.addEventListener;
    jest
      .spyOn(HTMLButtonElement.prototype, 'addEventListener')
      .mockImplementation(function (
        this: HTMLButtonElement,
        type,
        listener,
        options,
      ) {
        if (type === 'click') clicks.set(this, listener as EventListener);
        originalOn.call(this, type, listener, options);
      });
    const second = {
      ...website,
      id: 'business',
      title: 'Business account',
      selected: mode === 'selected website',
      fields: [
        { name: 'email', value: 'business@example.test', secret: false },
        { name: 'Password', value: '', secret: true, fieldIndex: 1 },
      ],
    };
    // Deliberately supply the stale global selection first, as in the reported bug.
    const records =
      mode.startsWith('explicit')
        ? [{ ...global, fields: [
          { name: 'email', value: 'global@example.test', secret: false },
          { name: 'username', aliases: ['email'], value: 'personal-user', secret: false },
        ] }, website]
        : mode === 'global fallback'
        ? [global]
        : ['multiple websites', 'selected website'].includes(mode)
          ? [global, website, second]
          : [global, website];
    const bridge = {
      invoke: jest.fn(async (channel: string, input?: any) => {
        if (channel.endsWith('enabled')) return true;
        if (channel === 'personal-data-autofill-focus')
          return mode !== 'focus disabled';
        if (
          channel === 'personal-data-autofill-records' ||
          channel === 'personal-data-autofill-availability'
        )
          return records;
        if (channel === 'personal-data-autofill-secret')
          return `fixture-${input.id}-secret`;
        return null;
      }),
      on: jest.fn(),
    };
    document.body.innerHTML =
      '<form><input type="email" autocomplete="email"><input type="password" autocomplete="current-password"><button type="submit">Sign in</button></form>';
    const fields = [...document.querySelectorAll<HTMLInputElement>('input')];
    fields.forEach((field) => {
      field.getClientRects = () => [{}] as any;
    });
    const submit = jest.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    const dispose = installPersonalDataAutofill(
      bridge,
      personalDataMatching.score,
    );
    try {
      await flush();
      fields[0].focus();
      await flush();
      if (mode === 'focus disabled')
        expect(shadow.querySelector('.panel')).toBeNull();
      else expect(shadow.querySelector('.panel')).not.toBeNull();
      expect(document.activeElement).toBe(fields[0]);
      expect(bridge.invoke).not.toHaveBeenCalledWith(
        'personal-data-autofill-secret',
        expect.anything(),
      );
      fields[0].value = 'typing';
      fields[0].dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.activeElement).toBe(fields[0]);
      fields[0].value = '';
      if (mode === 'password order') {
        fields[1].focus();
        await flush();
        const labels = [...shadow.querySelectorAll('.panel button')].map(
          (button) => button.textContent || '',
        );
        const saved = labels.findIndex(
          (label) => label === 'Fill form · Password',
        );
        const generate = labels.indexOf('Generate strong password');
        expect(saved).toBeGreaterThanOrEqual(0);
        expect(generate).toBeGreaterThan(saved);
        expect(bridge.invoke).not.toHaveBeenCalledWith(
          'personal-data-autofill-secret',
          expect.anything(),
        );
        fields[0].focus();
        await flush();
      }
      if (mode.startsWith('explicit')) {
        const value = mode === 'explicit email' ? 'global@example.test' : 'personal-user';
        const choice = [...shadow.querySelectorAll<HTMLButtonElement>('.panel button')]
          .find(button => button.textContent === value)!;
        expect(choice).toBeDefined();
        clicks.get(choice)!({ isTrusted: true } as Event);
        await flush();
        expect(fields[0].value).toBe(value);
        expect(fields[1].value).toBe('');
        expect(shadow.querySelector('.panel')?.isConnected).toBe(false);
        expect(document.activeElement).toBe(fields[0]);
        expect(bridge.invoke).not.toHaveBeenCalledWith('personal-data-autofill-secret', expect.anything());
        expect(submit).not.toHaveBeenCalled();
        return;
      }
      const trigger = shadow.querySelector(
        mode === 'picker' ? '.trigger' : '.quick-fill',
      )!;
      expect(trigger).not.toBeNull();
      clicks.get(trigger)!({ isTrusted: true } as Event);
      await flush();
      if (mode === 'picker') {
        const headings = [...shadow.querySelectorAll('.heading > span')].map(
          (element) => element.textContent,
        );
        expect(headings).toEqual(['Website account', 'Personal Profile']);
        const fill = [...shadow.querySelectorAll('button')].find(
          (button) => button.textContent === 'Fill this form',
        )!;
        clicks.get(fill)!({ isTrusted: true } as Event);
        await flush();
      } else if (mode === 'multiple websites') {
        expect(fields[0].value).toBe('');
        const choices = [...shadow.querySelectorAll('.panel button')].map(
          (button) => button.textContent,
        );
        expect(choices).toContain('Website account');
        expect(choices).toContain('Business account');
        expect(choices).not.toContain('Personal Profile');
        const business = [...shadow.querySelectorAll('button')].find(
          (button) => button.textContent === 'Business account',
        )!;
        clicks.get(business)!({ isTrusted: true } as Event);
        await flush();
      }
      const id = ['selected website', 'multiple websites'].includes(mode)
        ? 'business'
        : 'site';
      if (mode === 'global fallback') {
        expect(fields[0].value).toBe('global@example.test');
        expect(fields[1].value).toBe('');
        expect(bridge.invoke).not.toHaveBeenCalledWith(
          'personal-data-autofill-secret',
          expect.anything(),
        );
      } else {
        expect(fields[0].value).toBe(
          id === 'business' ? 'business@example.test' : 'website@example.test',
        );
        expect(fields[1].value).toBe(`fixture-${id}-secret`);
        expect(bridge.invoke).toHaveBeenCalledWith(
          'personal-data-autofill-secret',
          { id, fieldIndex: 1 },
        );
        expect(bridge.invoke).not.toHaveBeenCalledWith(
          'personal-data-autofill-secret',
          { id: 'global', fieldIndex: 1 },
        );
      }
      expect(submit).not.toHaveBeenCalled();
    } finally {
      dispose();
      jest.restoreAllMocks();
      document.body.innerHTML = '';
    }
  },
);
