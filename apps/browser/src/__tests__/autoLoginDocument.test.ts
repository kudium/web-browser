/** @jest-environment-options {"url":"https://example.com/business/sign-in"} */
import {
  inspectLoginDocument,
  waitForLoginDocument,
  fillLoginDocument,
  submitLoginDocument,
} from '../main/passwordManager/loginDocument';
import { preferredLoginURL } from '../main/passwordManager/loginRoute';

const origin = 'https://example.com';
const url = `${origin}/business/sign-in`;
const form =
  '<form><input autocomplete="username"><input type="password" autocomplete="current-password"><button type="submit">Sign in</button></form>';
beforeEach(() => {
  document.body.innerHTML = form;
  jest
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  // jsdom does not implement rendered innerText.
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent;
    },
  });
});
afterEach(() => jest.restoreAllMocks());

it('recognizes a login on a different path, fills controlled inputs, and submits only on request', () => {
  const submit = jest
    .spyOn(HTMLFormElement.prototype, 'requestSubmit')
    .mockImplementation(() => {});
  expect(inspectLoginDocument(origin).form).toBe(true);
  const events = jest.fn();
  document.querySelector('input')!.addEventListener('input', events);
  expect(fillLoginDocument(origin, url, 'fixture-user', 'fixture-secret')).toBe(
    true,
  );
  expect(events).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  expect(submitLoginDocument(origin, url)).toBe(true);
  expect(submit).toHaveBeenCalledWith(document.querySelector('button'));
  expect(JSON.stringify(inspectLoginDocument(origin))).not.toContain(
    'fixture-secret',
  );
});
it('rejects another origin, stale documents, signup, ambiguous and cross-origin forms', () => {
  expect(
    fillLoginDocument('https://other.example', url, 'user', 'secret'),
  ).toBe(false);
  expect(
    fillLoginDocument(origin, `${origin}/old-login`, 'user', 'secret'),
  ).toBe(false);
  document.body.innerHTML = form.replace('current-password', 'new-password');
  expect(inspectLoginDocument(origin).form).toBe(false);
  expect(fillLoginDocument(origin, url, 'user', 'secret')).toBe(false);
  document.body.innerHTML = form + form;
  expect(inspectLoginDocument(origin).form).toBe(false);
  expect(fillLoginDocument(origin, url, 'user', 'secret')).toBe(false);
  document.body.innerHTML = form.replace(
    '<form>',
    '<form action="https://other.example/login">',
  );
  expect(fillLoginDocument(origin, url, 'user', 'secret')).toBe(false);
  expect(submitLoginDocument(origin, url)).toBe(false);
});
it('leaves verification and ambiguous submit choices to the user', () => {
  fillLoginDocument(origin, url, 'user', 'secret');
  const submit = jest
    .spyOn(HTMLFormElement.prototype, 'requestSubmit')
    .mockImplementation(() => {});
  document
    .querySelector('form')!
    .insertAdjacentHTML('beforeend', '<input autocomplete="one-time-code">');
  expect(submitLoginDocument(origin, url)).toBe(false);
  expect(inspectLoginDocument(origin).form).toBe(false);
  document.body.innerHTML = form.replace(
    '</form>',
    '<button type="submit">Continue</button></form>',
  );
  fillLoginDocument(origin, url, 'user', 'secret');
  expect(submitLoginDocument(origin, url)).toBe(false);
  expect(submit).not.toHaveBeenCalled();
});
it('discovers both business and regular routes without accepting another website or SSO', () => {
  document.body.innerHTML =
    '<a href="/login">Login</a><a href="/business/login">Business login</a><a href="https://other.example/login">Admin login</a><button>Continue with Google</button>';
  expect(inspectLoginDocument(origin).destinations).toEqual([
    { url: `${origin}/login`, label: 'Login' },
    { url: `${origin}/business/login`, label: 'Business login' },
  ]);
  document.body.innerHTML = '<button>Sign out</button>';
  expect(inspectLoginDocument(origin).signedIn).toBe(true);
});
it('keeps routes as same-origin hints and removes transient query data', () => {
  expect(
    preferredLoginURL(`${url}?return=/private&token=temporary#step`, origin),
  ).toBe(url);
  expect(() =>
    preferredLoginURL('https://other.example/login', origin),
  ).toThrow('HTTPS website');
  expect(() => preferredLoginURL('http://example.com/login', origin)).toThrow(
    'HTTPS website',
  );
  expect(() =>
    preferredLoginURL('https://user:secret@example.com/login', origin),
  ).toThrow('HTTPS website');
});

it('does no idle polling, ignores unrelated mutations, and reacts to a login form', async () => {
  jest.useFakeTimers();
  try {
    document.body.innerHTML = '<div id="unrelated"></div>';
    const inspect = jest.fn(inspectLoginDocument);
    const pending = waitForLoginDocument(origin, 'form', 10000, inspect);
    expect(inspect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(3000);
    document.querySelector('#unrelated')!.textContent = 'animation';
    await jest.advanceTimersByTimeAsync(100);
    expect(inspect).toHaveBeenCalledTimes(1);
    document.body.insertAdjacentHTML('beforeend', form);
    await jest.advanceTimersByTimeAsync(100);
    expect((await pending).form).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(2);
    document.querySelector('input')!.setAttribute('disabled', '');
    await jest.advanceTimersByTimeAsync(10000);
    expect(inspect).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});
