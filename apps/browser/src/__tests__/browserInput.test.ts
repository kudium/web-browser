/** @jest-environment node */
import { requestBrowserInput } from '../main/browserInput';
import { hookInputMemory } from '../main/hookInputMemory';
import { showBrowserDialog } from '../main/dialogs';
// eslint-disable-next-line import/no-relative-packages
import {
  validateHookInputRequest,
  validateHookInputResponse,
  hookInputError,
} from '../../../../packages/hooks/actions';
jest.mock('../main/hookInputMemory', () => ({ hookInputMemory: jest.fn() }));
jest.mock('../main/hookActionPersonalData', () => ({
  prepareInputPersonalData: jest.fn(async () => undefined),
}));
jest.mock('../main/passwordManager', () => ({
  onPersonalDataRevoked: () => jest.fn(),
}));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
const options = () => ({
  recipient: 'Hook · Ask',
  fields: ['question'],
  signal: new AbortController().signal,
});
it('returns only user-entered fields and honors cancellation and abort', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({
    response: 1,
    inputValues: { question: 'Explain this' },
  });
  expect(await requestBrowserInput({} as any, options())).toEqual({
    question: 'Explain this',
  });
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  expect(await requestBrowserInput({} as any, options())).toBeNull();
  const controller = new AbortController();
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    controller.abort();
    return { response: 0 };
  });
  await expect(
    requestBrowserInput({} as any, { ...options(), signal: controller.signal })
  ).rejects.toThrow();
});
it('rejects unknown request types, unsafe keys, duplicate or excessive fields and extra data', () => {
  for (const request of [
    { type: 'vault', fields: ['name'] },
    { type: 'input', fields: ['constructor'] },
    { type: 'input', fields: [] },
    { type: 'input', fields: ['a', 'a'] },
    { type: 'input', fields: ['a'.repeat(61)] },
    { type: 'input', fields: Array.from({ length: 11 }, (_, i) => `a${i}`) },
    { type: 'input', fields: ['a'], source: 'code' },
  ])
    expect(() => validateHookInputRequest(request)).toThrow();
  const request = validateHookInputRequest({
    type: 'input',
    fields: ['question'],
  });
  for (const value of [
    {},
    { question: 'x', extra: 'secret' },
    { question: 42 },
    { question: 'x'.repeat(10001) },
  ])
    expect(() => validateHookInputResponse(request, value)).toThrow();
  expect(validateHookInputResponse(request, { question: '' })).toEqual({
    question: '',
  });
});

it('normalizes custom labels, groups, required fields, select options and legacy aliases', () => {
  const request = validateHookInputRequest({
    type: 'input',
    title: 'Profile',
    fields: [
      {
        key: 'email',
        label: 'Work email',
        type: 'email',
        group: 'Profile',
        required: true,
        personalData: 'email',
      },
      {
        key: 'plan',
        type: 'select',
        options: [{ value: 'basic', label: 'Basic' }],
      },
    ],
  });
  expect(request.fields[0]).toMatchObject({
    label: 'Work email',
    group: 'Profile',
    required: true,
  });
  expect(() =>
    validateHookInputResponse(request, { email: '', plan: '' })
  ).toThrow();
  expect(() =>
    validateHookInputResponse(request, { email: 'bad', plan: 'basic' })
  ).toThrow();
  expect(
    validateHookInputResponse(request, {
      email: 'work@example.com',
      plan: 'basic',
    })
  ).toEqual({ email: 'work@example.com', plan: 'basic' });
  expect(
    validateHookInputRequest({ type: 'personalData', fields: ['firstName'] })
      .fields[0]
  ).toMatchObject({ key: 'firstName', personalData: 'firstName' });
  for (const field of [
    { key: 'password', type: 'password', personalData: 'password' },
    { key: 'x', required: 'yes' },
    { key: 'x', type: 'script' },
    { key: 'x', type: 'select' },
  ])
    expect(() =>
      validateHookInputRequest({ type: 'input', fields: [field] })
    ).toThrow();
});
it('validates number/date/url types and required whitespace while leaving optional text empty', () => {
  expect(hookInputError({ key: 'x', required: true }, '  ')).toContain(
    'required'
  );
  expect(hookInputError({ key: 'x' }, '')).toBe('');
  expect(hookInputError({ key: 'x', type: 'number' }, 'NaN')).toContain(
    'number'
  );
  expect(hookInputError({ key: 'x', type: 'number' }, '1.25')).toBe('');
  expect(hookInputError({ key: 'x', type: 'date' }, '2026-02-30')).toContain(
    'date'
  );
  expect(hookInputError({ key: 'x', type: 'date' }, '2026-11-13')).toBe('');
  expect(
    hookInputError({ key: 'x', type: 'url' }, 'javascript:alert(1)')
  ).toContain('URL');
});

it('prefills remembered answers locally, saves only on Continue and skips storage in preview', async () => {
  const memory = {
    available: true,
    load: jest.fn(() => ({ email: 'saved@example.com' })),
    save: jest.fn(),
  };
  (hookInputMemory as jest.Mock).mockReturnValue(memory);
  const input = {
    ...options(),
    fields: [{ key: 'email', type: 'email' as const, required: true }],
    binding: {
      profile: 'default',
      scope: 'space',
      origin: 'https://example.com',
      hookId: 'hook',
      actionId: 'action',
      source: 'script',
    },
  };
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({
    response: 1,
    inputValues: { email: 'edited@example.com' },
    remembered: ['email'],
  });
  expect(await requestBrowserInput({} as any, input)).toEqual({
    email: 'edited@example.com',
  });
  const picker = (showBrowserDialog as jest.Mock).mock.calls.at(-1)[1];
  expect(picker.inputs[0]).toMatchObject({
    value: 'saved@example.com',
    remember: true,
    remembered: true,
  });
  expect(memory.save).toHaveBeenCalledWith(
    expect.anything(),
    { email: 'edited@example.com' },
    ['email']
  );
  memory.save.mockClear();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  expect(await requestBrowserInput({} as any, input)).toBeNull();
  expect(memory.save).not.toHaveBeenCalled();
  memory.load.mockClear();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({
    response: 1,
    inputValues: { email: 'sample@example.com' },
  });
  await requestBrowserInput({} as any, { ...input, preview: true });
  expect(memory.load).not.toHaveBeenCalled();
  expect(memory.save).not.toHaveBeenCalled();
});
