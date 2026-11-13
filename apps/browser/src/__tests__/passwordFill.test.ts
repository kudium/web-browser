/** @jest-environment-options {"url":"https://example.com"} */
import { createPersonalDataMatching } from '../browser/personalDataMatching';
import { fillDocument } from '../main/passwordManager/fill';
import type { VaultItem } from '../browser/passwordManager';

const item: VaultItem = {
  id: 'a',
  origin: window.location.origin,
  title: 'Account',
  kind: 'login',
  username: 'person',
  password: 'secret',
  fields: [],
  allowAI: true,
};
describe('local autofill boundary', () => {
  it('refuses insecure and mismatched documents without modifying fields', () => {
    document.body.innerHTML =
      '<input autocomplete="username"><input type="password">';
    expect(
      fillDocument({ ...item, origin: 'http://example.com' }, true)
    ).toEqual({ filled: 0 });
    expect((document.querySelector('input') as HTMLInputElement).value).toBe(
      ''
    );
    expect(
      fillDocument({ ...item, origin: 'https://different.example' }, true)
    ).toEqual({ filled: 0 });
  });
  it('fills a login without submitting and keeps custom values out of AI filling', () => {
    document.body.innerHTML =
      '<form><input autocomplete="username"><input type="password"><input name="tel"></form>';
    jest
      .spyOn(HTMLInputElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as any);
    const submit = jest.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    expect(
      fillDocument(
        { ...item, fields: [{ name: 'tel', value: '555', secret: false }] },
        true
      )
    ).toEqual({ filled: 2 });
    expect(
      (document.querySelector('[autocomplete="username"]') as HTMLInputElement)
        .value
    ).toBe('person');
    expect(
      (document.querySelector('[type="password"]') as HTMLInputElement).value
    ).toBe('secret');
    expect(
      (document.querySelector('[name="tel"]') as HTMLInputElement).value
    ).toBe('');
    expect(submit).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
  it('rejects signup forms and masks sensitive custom values', () => {
    jest
      .spyOn(HTMLInputElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as any);
    document.body.innerHTML =
      '<input type="password" autocomplete="new-password">';
    expect(fillDocument(item, true)).toEqual({ filled: 0 });
    document.body.innerHTML = '<input name="private">';
    expect(
      fillDocument(
        {
          ...item,
          kind: 'profile',
          fields: [{ name: 'private', value: 'secret', secret: true }],
        },
        false
      )
    ).toEqual({ filled: 1 });
    expect((document.querySelector('input') as HTMLInputElement).type).toBe(
      'password'
    );
    jest.restoreAllMocks();
  });
});

it('fills profile aliases, textareas and unambiguous select values without submitting', () => {
  document.body.innerHTML =
    '<form><input name="contact"><textarea name="experience"></textarea><select name="country"><option value="CA">Canada</option><option value="US">United States</option></select></form>';
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  jest
    .spyOn(HTMLTextAreaElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  jest
    .spyOn(HTMLSelectElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  const submit = jest.fn();
  document.querySelector('form')!.addEventListener('submit', submit);
  const result = fillDocument(
    {
      ...item,
      kind: 'profile',
      password: '',
      fields: [
        {
          name: 'email',
          aliases: ['contact'],
          value: 'person@example.com',
          secret: false,
        },
        { name: 'experience', value: 'Frontend engineer', secret: false },
        { name: 'country', value: 'Canada', secret: false },
      ],
    },
    true
  );
  expect(result).toEqual({ filled: 3 });
  expect(document.querySelector('textarea')!.value).toBe('Frontend engineer');
  expect(document.querySelector('select')!.value).toBe('CA');
  expect(submit).not.toHaveBeenCalled();
});
it('masks sensitive payment values and skips ambiguous matches', () => {
  document.body.innerHTML =
    '<input name="cc-number"><input name="email"><input name="email">';
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  expect(
    fillDocument(
      {
        ...item,
        kind: 'payment',
        fields: [
          { name: 'cc-number', value: 'test-card', secret: true },
          { name: 'email', value: 'person@example.com', secret: false },
        ],
      },
      true
    )
  ).toEqual({ filled: 1 });
  expect(
    document.querySelector<HTMLInputElement>('[name="cc-number"]')!.type
  ).toBe('password');
});

it('fills all four values from one item using website metadata and an explicit phone mapping', () => {
  document.body.innerHTML =
    '<form><input autocomplete="section-contact shipping email"><label for="user">Username</label><input id="user"><input autocomplete="name"><span id="phone-label">Phone number</span><input aria-labelledby="phone-label"></form>';
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  const result = fillDocument(
    {
      ...item,
      kind: 'profile',
      fields: [
        { name: 'Email', value: 'alex@example.com', secret: false },
        { name: 'Username', value: 'alex01', secret: false },
        { name: 'Name', value: 'Alex Example', secret: false },
        {
          name: 'Number',
          value: '+15555550100',
          aliases: ['tel'],
          secret: false,
        },
      ],
    },
    false
  );
  expect(result).toEqual({ filled: 4 });
  expect(
    Array.from(document.querySelectorAll('input')).map((input) => input.value)
  ).toEqual(['alex@example.com', 'alex01', 'Alex Example', '+15555550100']);
  jest.restoreAllMocks();
});

it('prefers exact field metadata, skips collisions and never treats full name as first name', () => {
  document.body.innerHTML =
    '<input autocomplete="given-name"><input placeholder="Work email"><input autocomplete="email"><input name="age" type="number">';
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  expect(
    fillDocument(
      {
        ...item,
        kind: 'profile',
        fields: [
          { name: 'Name', value: 'Alex Example', secret: false },
          { name: 'Email', value: 'alex@example.com', secret: false },
          { name: 'Number', value: '+15555550100', secret: false },
        ],
      },
      false
    )
  ).toEqual({ filled: 1 });
  expect(
    Array.from(document.querySelectorAll('input')).map((input) => input.value)
  ).toEqual(['', '', 'alex@example.com', '']);
  document.body.innerHTML = '<input autocomplete="email">';
  expect(
    fillDocument(
      {
        ...item,
        kind: 'profile',
        fields: [
          { name: 'Email', value: 'first@example.com', secret: false },
          {
            name: 'Work email',
            aliases: ['email'],
            value: 'second@example.com',
            secret: false,
          },
        ],
      },
      false
    )
  ).toEqual({ filled: 0 });
  jest.restoreAllMocks();
});

it('fills additional login values on pages without a password field', () => {
  document.body.innerHTML = '<input autocomplete="given-name">';
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  expect(
    fillDocument(
      {
        ...item,
        fields: [{ name: 'First name', value: 'Alex', secret: false }],
      },
      false
    )
  ).toEqual({ filled: 1 });
  jest.restoreAllMocks();
});

it('runs the shared matcher in the serialized main-frame fill without module access', () => {
  document.body.innerHTML = '<input autocomplete="name">';
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  const payload = {
    ...item,
    kind: 'profile',
    fields: [{ name: 'Name', value: 'Alex Example', secret: false }],
  };
  // Mirrors executeJavaScript: the frame has no imported application modules.
  // eslint-disable-next-line no-new-func
  const run = new Function(
    'window',
    'document',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'Event',
    `return (${fillDocument.toString()})(${JSON.stringify(
      payload
    )}, false, (${createPersonalDataMatching.toString()})().score)`
  );
  expect(
    run(
      window,
      document,
      HTMLInputElement,
      HTMLTextAreaElement,
      HTMLSelectElement,
      Event
    )
  ).toEqual({ filled: 1 });
  jest.restoreAllMocks();
});
