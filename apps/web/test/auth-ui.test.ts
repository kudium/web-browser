import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { authPage } from '../src/pages';

test('account pages include an accessible, initially hidden confirmation screen', () => {
  for (const mode of ['sign-up', 'sign-in', 'forgot-password', 'reset-password'] as const) {
    const html = authPage(mode, true, true);
    expect(html).toContain('data-auth-success="true" hidden=""');
    expect(html).toContain('id="auth-success-title" tabindex="-1"');
    expect(html).toContain('aria-atomic="true"');
  }
});
async function submit(mode: string, response: unknown, ok = true) {
  let submitHandler: (event: unknown) => Promise<void>;
  let backHandler: () => void;
  const email = '<unsafe>@example.com';
  const button = { disabled: false };
  const emailInput = { focus() { this.focused = true; }, focused: false };
  const title = { focus() { this.focused = true; }, focused: false };
  const description = { textContent: '' };
  const back = { textContent: '', addEventListener(_: string, fn: () => void) { backHandler = fn; } };
  const entry = { hidden: false };
  const message = { textContent: '', dataset: {} as Record<string, string>, setAttribute() {} };
  const success = { hidden: true, querySelector(selector: string) { return selector === 'h2' ? title : selector.includes('description') ? description : back; } };
  const form = { dataset: { authForm: mode }, elements: { email: emailInput }, querySelector() { return button; }, addEventListener(_: string, fn: typeof submitHandler) { submitHandler = fn; } };
  const nodes: Record<string, unknown> = { '[data-auth-form]': form, '[data-auth-message]': message, '[data-auth-back]': back, '[data-auth-success]': success, '[data-auth-entry]': entry };
  let destination = '';
  runInNewContext(readFileSync(new URL('../public/auth.js', import.meta.url), 'utf8'), {
    document: { querySelector: (selector: string) => nodes[selector], querySelectorAll: () => [] },
    FormData: class { get(key: string) { return key === 'email' ? email : key === 'password' ? 'long password' : 'Test'; } },
    location: { search: '', origin: 'https://browser.kudium.com', assign: (url: string) => { destination = url; } },
    URLSearchParams, Error, fetch: async () => ({ ok, status: ok ? 200 : 400, json: async () => response }),
  });
  await submitHandler!({ preventDefault() {} });
  return { success, entry, description, title, message, button, emailInput, back: () => backHandler!(), destination };
}
test('signup confirmation replaces the form and focuses next steps; email stays plain text', async () => {
  const state = await submit('sign-up', { user: {} });
  expect(state.entry.hidden).toBe(true);
  expect(state.success.hidden).toBe(false);
  expect(state.title.focused).toBe(true);
  expect(state.description.textContent).toContain('<unsafe>@example.com');
  expect(state.destination).toBe('');
  state.back();
  expect(state.entry.hidden).toBe(false);
  expect(state.emailInput.focused).toBe(true);
});
test('recovery confirmation does not reveal account existence', async () => {
  const state = await submit('forgot-password', {});
  expect(state.description.textContent).toContain('If an account exists');
  expect(state.success.hidden).toBe(false);
});
test('failed signup leaves form available and shows the error', async () => {
  const state = await submit('sign-up', { message: 'Unable to create account' }, false);
  expect(state.success.hidden).toBe(true);
  expect(state.entry.hidden).toBe(false);
  expect(state.message.dataset.error).toBe('true');
  expect(state.button.disabled).toBe(false);
});
