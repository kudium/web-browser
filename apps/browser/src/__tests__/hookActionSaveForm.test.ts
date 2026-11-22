/** @jest-environment node */
import type { BrowserWindow, WebContents } from 'electron';
import {
  formSaveReview,
  reviewedFormItem,
  saveActionForm,
} from '../main/hookActionSaveForm';
import {
  readActionFormForSave,
  findPageActionForms,
  captureSelectedActionForm,
} from '../main/hookActionField';
import { showBrowserDialog } from '../main/dialogs';
import {
  savePersonalDocument,
  onPersonalDataRevoked,
} from '../main/passwordManager';
import { validateFormReviewResult } from '../main/browserFormReview';

jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('../main/hookActionField', () => ({
  readActionFormForSave: jest.fn(),
  findPageActionForms: jest.fn(),
  captureSelectedActionForm: jest.fn(),
}));
jest.mock('../main/passwordManager', () => ({
  savePersonalDocument: jest.fn(),
  onPersonalDataRevoked: jest.fn(),
}));
const field = (
  key: string,
  label: string,
  value: string,
  type = 'text',
  autocomplete = ''
) => ({
  key,
  label,
  value,
  type,
  autocomplete,
  name: label,
  id: key,
  placeholder: '',
  required: false,
});
const fields = [
  field('f0', 'Username', 'alex'),
  field('f1', 'Email', 'alex@example.com', 'email'),
  field('f2', 'Password', 'private-password', 'password'),
];
const options = () => ({
  owner: {} as BrowserWindow,
  contents: {} as WebContents,
  token: 'token',
  url: 'https://example.com/signup',
  scope: 'group:work',
  signal: new AbortController().signal,
  check: jest.fn(),
});
const reply = (review = formSaveReview(fields, 'example.com')) => ({
  title: 'My profile',
  availability: 'site' as const,
  fields: review.fields.map((f) => ({
    key: f.key,
    value: f.value,
    mapping: f.mapping,
  })),
});
beforeEach(() => {
  jest.clearAllMocks();
  (readActionFormForSave as jest.Mock).mockResolvedValue(fields);
  (findPageActionForms as jest.Mock).mockResolvedValue([
    { key: 'g0', label: 'Profile (3 fields)' },
  ]);
  (captureSelectedActionForm as jest.Mock).mockResolvedValue(true);
  (onPersonalDataRevoked as jest.Mock).mockReturnValue(jest.fn());
  (showBrowserDialog as jest.Mock).mockResolvedValue({
    response: 1,
    formReview: reply(),
  });
});

it('uses the only filled form when invoked from the page', async () => {
  await saveActionForm({ ...options(), page: true });
  expect(captureSelectedActionForm).toHaveBeenCalledWith(
    expect.anything(),
    'token',
    'g0'
  );
  expect(showBrowserDialog).toHaveBeenCalledTimes(1);
  expect(savePersonalDocument).toHaveBeenCalled();
});

it('lets the user choose among page forms and cancels without reading private values', async () => {
  (findPageActionForms as jest.Mock).mockResolvedValue([
    { key: 'g0', label: 'Login' },
    { key: 'g1', label: 'Profile' },
  ]);
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 2 });
  await saveActionForm({ ...options(), page: true });
  expect(captureSelectedActionForm).toHaveBeenCalledWith(
    expect.anything(),
    'token',
    'g1'
  );
  jest.clearAllMocks();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  await saveActionForm({ ...options(), page: true });
  expect(readActionFormForSave).not.toHaveBeenCalled();
  expect(savePersonalDocument).not.toHaveBeenCalled();
});

it('infers mappings with the shared matcher and never places passwords in the review', () => {
  const review = formSaveReview(fields, 'example.com');
  expect(review.fields.map((f) => f.mapping)).toEqual([
    'username',
    'email',
    'current-password',
  ]);
  expect(JSON.stringify(review)).not.toContain('private-password');
  expect(review.fields[2]).toMatchObject({ secret: true, value: '' });
});
it('creates site-bound credentials and retains other form fields', () => {
  const review = formSaveReview(fields, 'example.com');
  const item = reviewedFormItem(fields, review, reply(), 'https://example.com');
  expect(item).toMatchObject({
    kind: 'login',
    origin: 'https://example.com',
    username: 'alex',
    password: 'private-password',
    allowAI: true,
  });
  expect(item.fields).toEqual([
    {
      name: 'Email',
      value: 'alex@example.com',
      secret: false,
      aliases: ['email'],
    },
  ]);
});
it('lets ordinary details be reusable and editable without including unselected credentials', () => {
  const review = formSaveReview(fields, 'example.com');
  const item = reviewedFormItem(
    fields,
    review,
    {
      title: 'Contact',
      availability: 'anywhere',
      fields: [{ key: 'f1', value: 'work@example.com', mapping: 'email' }],
    },
    'https://example.com'
  );
  expect(item).toMatchObject({
    kind: 'profile',
    origin: '',
    password: '',
    username: '',
  });
  expect(item.fields[0]).toMatchObject({
    value: 'work@example.com',
    aliases: ['email'],
  });
});
it('rejects unknown fields, duplicate keys, private cross-site storage and forged password values', () => {
  const review = formSaveReview(fields, 'example.com');
  for (const value of [
    { ...reply(), availability: 'anywhere' },
    { ...reply(), fields: [{ key: 'unknown', value: 'x', mapping: '' }] },
    { ...reply(), fields: [reply().fields[0], reply().fields[0]] },
    {
      ...reply(),
      fields: [{ key: 'f2', value: 'forged', mapping: 'current-password' }],
    },
    {
      ...reply(),
      fields: [{ key: 'f1', value: 'x', mapping: 'current-password' }],
    },
  ])
    expect(() => validateFormReviewResult(value, review)).toThrow();
});
it('stores equal confirmation passwords once and rejects different selected passwords', () => {
  const confirmed = [
    ...fields,
    field('f3', 'Confirm password', 'private-password', 'password'),
  ];
  const review = formSaveReview(confirmed, 'example.com');
  const result = reply(review);
  expect(
    reviewedFormItem(confirmed, review, result, 'https://example.com').password
  ).toBe('private-password');
  expect(() =>
    reviewedFormItem(
      [...fields, { ...confirmed[3], value: 'different' }],
      review,
      result,
      'https://example.com'
    )
  ).toThrow('Choose one password');
});
it('saves only after review and revalidates the form and group scope', async () => {
  const config = options();
  await saveActionForm(config);
  expect(readActionFormForSave).toHaveBeenCalledTimes(2);
  expect(savePersonalDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: 'https://example.com',
      password: 'private-password',
    }),
    'group:work',
    expect.any(Function)
  );
  expect(
    JSON.stringify((showBrowserDialog as jest.Mock).mock.calls)
  ).not.toContain('private-password');
});
it('does not save on cancellation, navigation, insecure pages or changed values', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  await saveActionForm(options());
  expect(savePersonalDocument).not.toHaveBeenCalled();
  await expect(
    saveActionForm({ ...options(), url: 'http://example.com' })
  ).rejects.toThrow('HTTPS');
  (readActionFormForSave as jest.Mock)
    .mockResolvedValueOnce(fields)
    .mockResolvedValueOnce([{ ...fields[0], value: 'changed' }]);
  await expect(saveActionForm(options())).rejects.toThrow('form changed');
  const config = options();
  config.check.mockImplementation(() => {
    throw new Error('Page changed');
  });
  await expect(saveActionForm(config)).rejects.toThrow('Page changed');
  expect(savePersonalDocument).not.toHaveBeenCalled();
});
it('aborts the review on Personal Data lock and releases the lock listener', async () => {
  const off = jest.fn();
  let revoke = () => {};
  (onPersonalDataRevoked as jest.Mock).mockImplementation((callback) => {
    revoke = callback;
    return off;
  });
  (showBrowserDialog as jest.Mock).mockImplementation(
    async (_owner, config) => {
      revoke();
      expect(config.signal.aborted).toBe(true);
      return { response: 1, formReview: reply() };
    }
  );
  await expect(saveActionForm(options())).rejects.toThrow();
  expect(savePersonalDocument).not.toHaveBeenCalled();
  expect(off).toHaveBeenCalled();
});
