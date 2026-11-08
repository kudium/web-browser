import { aiInputHTML, privateFieldTargets } from '../main/aiUserInput';

test('private form escapes untrusted task text and prefilled origin', () => {
  const html = aiInputHTML({
    title: '<script>bad()</script>',
    reason: '" onclick="bad()',
    origin: 'https://example.com/<test>',
    fields: ['password', 'api-token'],
  });
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(html).not.toContain('<script>bad()');
  const root = document.createElement('div');
  root.innerHTML = html;
  expect(root.querySelector<HTMLInputElement>('[name="field-0"]')!.type).toBe(
    'password'
  );
  expect(root.querySelector<HTMLInputElement>('[name="field-1"]')!.type).toBe(
    'password'
  );
  expect(root.querySelector<HTMLInputElement>('[name="save"]')!.checked).toBe(
    false
  );
});
test('suggestions stay presentation text and require confirmed answer', () => {
  const html = aiInputHTML({
    title: 'Choose',
    reason: 'Task needs clarification',
    options: ['<img src=x onerror=bad()>'],
  });
  const root = document.createElement('div');
  root.innerHTML = html;
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('.choice')!.textContent).toBe(
    '<img src=x onerror=bad()>'
  );
  expect(root.querySelector<HTMLTextAreaElement>('textarea')!.required).toBe(
    true
  );
});
test('private mapping rejects hidden, disabled, missing and ambiguous inputs', () => {
  document.body.innerHTML =
    '<input name="email" autocomplete="username"><input type="password" id="login-password"><input name="hidden-token" type="hidden"><input name="disabled" disabled>';
  document.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    input.getClientRects = () =>
      [{ width: 100, height: 20 }] as unknown as DOMRectList;
  });
  expect(privateFieldTargets(['email', 'login-password'])).toBe(true);
  expect(privateFieldTargets(['username'])).toBe(true);
  expect(privateFieldTargets(['hidden-token'])).toBe(false);
  expect(privateFieldTargets(['disabled'])).toBe(false);
  expect(privateFieldTargets(['missing'])).toBe(false);
  const extra = document.createElement('input');
  extra.name = 'email';
  extra.getClientRects = () =>
    [{ width: 100, height: 20 }] as unknown as DOMRectList;
  document.body.append(extra);
  expect(privateFieldTargets(['email'])).toBe(false);
});
