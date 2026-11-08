import { captureForm } from '../main/passwordManager/capture';

beforeEach(() => {
  jest
    .spyOn(HTMLInputElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
});
afterEach(() => jest.restoreAllMocks());
it('captures only explicitly selected visible basic fields and excludes disguised one-time codes', () => {
  document.body.innerHTML =
    '<input name="email" value="person@example.com"><input name="name" value="Person"><input name="csrf" type="hidden" value="token"><input id="otp" autocomplete="email" value="code"><input type="password" name="pwd" value="secret">';
  const fields = captureForm(['email', 'csrf', 'pwd']);
  expect(fields.map((field) => field.value)).toEqual(['person@example.com']);
});
it('keeps explicitly selected credentials in local capture and marks them protected', () => {
  document.body.innerHTML =
    '<input name="email" value="person@example.com"><input type="password" name="pwd" value="local-secret"><input autocomplete="one-time-code" value="otp">';
  const fields = captureForm(['email', 'pwd', 'one-time-code'], true);
  expect(
    fields.find((field) => field.name === 'current-password')
  ).toMatchObject({ value: 'local-secret', secret: true });
  expect(fields.some((field) => field.value === 'otp')).toBe(false);
});
