/** @jest-environment node */
import {
  fillActionPersonalData,
  personalFieldScore,
} from '../main/hookActionPersonalData';
import { requestBrowserInput } from '../main/browserInput';
import { showBrowserDialog } from '../main/dialogs';
import { fillActionField } from '../main/hookActionField';
import { authenticatePersonalData } from '../main/passwordManager';
jest.mock('../main/hookInputMemory', () => ({ hookInputMemory: jest.fn() }));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('../main/hookActionField', () => ({ fillActionField: jest.fn() }));
let mockRevoked: () => void;
let mockRecord: any;
let mockRevision = 0;
const mockVault = {
  matching: jest.fn(),
  forFill: jest.fn(),
  records: jest.fn(),
};
jest.mock('../main/passwordManager', () => ({
  passwordVault: () => ({
    status: () => ({ initialized: true, enabled: true, autofill: true }),
  }),
  authenticatePersonalData: jest.fn(async () => {}),
  withPersonalData: (work: any) => work(mockVault),
  personalDataRevision: () => mockRevision,
  onPersonalDataRevoked: (listener: any) => {
    mockRevoked = listener;
    return jest.fn();
  },
}));
const options = () => ({
  owner: {} as any,
  contents: {} as any,
  token: 'token',
  url: 'https://example.com/form',
  scope: 'group',
  field: { type: 'email', label: 'Work email', name: 'email' },
  signal: new AbortController().signal,
  check: jest.fn(),
});
beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 0;
  mockRecord = {
    id: 'profile',
    kind: 'profile',
    title: 'Work',
    fields: [
      { name: 'First name', value: 'Alex', secret: false },
      { name: 'Email', value: 'private@example.com', secret: false },
      { name: 'API key', value: 'PRIVATE_TOKEN', secret: true },
    ],
  };
  mockVault.matching.mockReturnValue([{ id: 'profile' }]);
  mockVault.forFill.mockImplementation(() => mockRecord);
  mockVault.records.mockImplementation(() => [mockRecord]);
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
});
it('uses the existing scope/autofill gate and fills selected fields without returning values to scripts', async () => {
  const input = options();
  const result = await fillActionPersonalData(input);
  expect(result).toBeUndefined();
  expect(authenticatePersonalData).toHaveBeenCalled();
  expect(mockVault.matching).toHaveBeenCalledWith(input.url, false, 'group');
  expect(mockVault.records).toHaveBeenCalledTimes(1);
  expect(mockVault.forFill).toHaveBeenCalledTimes(1);
  const picker = (showBrowserDialog as jest.Mock).mock.calls[0][1];
  expect(picker.savedPicker.map((c: any) => c.label)).toEqual([
    'Work · Email',
    'Work · First name',
  ]);
  expect(JSON.stringify(picker)).not.toContain('private@example.com');
  expect(JSON.stringify(picker)).not.toContain('PRIVATE_TOKEN');
  expect(fillActionField).toHaveBeenCalledWith(
    input.contents,
    'token',
    'private@example.com',
    false
  );
});
it('honors cancellation, target changes, saved value changes and vault revocation', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  await fillActionPersonalData(options());
  expect(fillActionField).not.toHaveBeenCalled();
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    mockRecord.fields[1].value = 'changed@example.com';
    return { response: 1 };
  });
  await expect(fillActionPersonalData(options())).rejects.toThrow(
    'saved field changed'
  );
  expect(fillActionField).not.toHaveBeenCalled();
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    mockRevoked();
    mockRevision++;
    return { response: 1 };
  });
  await expect(fillActionPersonalData(options())).rejects.toThrow();
  expect(fillActionField).not.toHaveBeenCalled();
  const changed = options();
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    changed.check.mockImplementation(() => {
      throw new Error('Page changed');
    });
    return { response: 1 };
  });
  await expect(fillActionPersonalData(changed)).rejects.toThrow('Page changed');
  expect(fillActionField).not.toHaveBeenCalled();
});
it('rejects insecure destinations before opening saved data', async () => {
  await expect(
    fillActionPersonalData({ ...options(), url: 'http://example.com' })
  ).rejects.toThrow('HTTPS');
  expect(authenticatePersonalData).not.toHaveBeenCalled();
});
it('matches input labels, aliases and autocomplete hints', () => {
  expect(
    personalFieldScore('First name', [], {
      type: 'text',
      autocomplete: 'given-name',
    })
  ).toBe(2);
  expect(
    personalFieldScore('Email', [], { type: 'text', placeholder: 'Work email' })
  ).toBe(1);
});

const requestActionPersonalData = (input: any) =>
  requestBrowserInput(input.owner, { ...input, fields: input.request.fields });
const requestOptions = () => ({
  ...options(),
  recipient: 'Form tools · Combine name',
  request: { type: 'personalData' as const, fields: ['firstName', 'email'] },
});
const sharedAnswer = () => ({
  response: 1,
  inputValues: { firstName: 'Alex', email: 'private@example.com' },
  savedSources: { firstName: '0', email: '1' },
});
it('prefills mapped fields locally and returns only the edited or selected values after Continue', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue(sharedAnswer());
  expect(await requestActionPersonalData(requestOptions())).toEqual({
    firstName: 'Alex',
    email: 'private@example.com',
  });
  const picker = (showBrowserDialog as jest.Mock).mock.calls[0][1];
  expect(picker.eyebrow).toContain('Form tools · Combine name');
  expect(picker.inputs.map((v: any) => v.key)).toEqual(['firstName', 'email']);
  expect(picker.inputs.map((v: any) => v.value)).toEqual([
    'Alex',
    'private@example.com',
  ]);
  expect(JSON.stringify(picker)).not.toContain('PRIVATE_TOKEN');
  expect(mockVault.matching).toHaveBeenCalledTimes(1);
  expect(mockVault.records).toHaveBeenCalledTimes(1);
  expect(mockVault.forFill).toHaveBeenCalledWith(
    'profile',
    options().url,
    false,
    'group'
  );
  expect(fillActionField).not.toHaveBeenCalled();
});
it('returns null on Cancel and rejects changed or protected saved choices', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 0 });
  expect(await requestActionPersonalData(requestOptions())).toBeNull();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({
    ...sharedAnswer(),
    savedSources: { firstName: '2' },
  });
  await expect(requestActionPersonalData(requestOptions())).rejects.toThrow(
    'unavailable'
  );
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    mockRecord.fields[0].value = 'Changed';
    return sharedAnswer();
  });
  await expect(requestActionPersonalData(requestOptions())).rejects.toThrow(
    'saved field changed'
  );
});
it('stops requests on vault lock/navigation and allows custom input on insecure sites without reading saved data', async () => {
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    mockRevoked();
    mockRevision++;
    return { response: 0 };
  });
  await expect(requestActionPersonalData(requestOptions())).rejects.toThrow();
  const changed = requestOptions();
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    changed.check.mockImplementation(() => {
      throw new Error('Page changed');
    });
    return { response: 0 };
  });
  await expect(requestActionPersonalData(changed)).rejects.toThrow(
    'Page changed'
  );
  const calls = (authenticatePersonalData as jest.Mock).mock.calls.length;
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({
    ...sharedAnswer(),
    savedSources: {},
  });
  expect(
    await requestActionPersonalData({
      ...requestOptions(),
      url: 'http://example.com',
    })
  ).toEqual(sharedAnswer().inputValues);
  expect(authenticatePersonalData).toHaveBeenCalledTimes(calls);
  await expect(
    requestActionPersonalData({
      ...requestOptions(),
      request: { type: 'input', fields: ['constructor'] },
    })
  ).rejects.toThrow();
});

it('offers every non-secret extra value saved with a login item', async () => {
  mockRecord.kind = 'login';
  mockRecord.username = 'alex01';
  mockRecord.fields.push({
    name: 'Number',
    aliases: ['tel'],
    value: '+15555550100',
    secret: false,
  });
  await fillActionPersonalData(options());
  const labels = (
    showBrowserDialog as jest.Mock
  ).mock.calls[0][1].savedPicker.map((choice: any) => choice.label);
  expect(labels).toEqual(
    expect.arrayContaining([
      'Work · Username',
      'Work · First name',
      'Work · Email',
      'Work · Number',
    ])
  );
  expect(labels).toHaveLength(4);
});

it('respects explicit fill mappings and does not guess what Number means', () => {
  expect(personalFieldScore('Number', [], { type: 'tel' })).toBe(0);
  expect(
    personalFieldScore('Number', ['tel'], {
      type: 'text',
      autocomplete: 'section-x shipping tel',
    })
  ).toBe(2);
  expect(
    personalFieldScore('Name', ['given-name'], {
      type: 'text',
      autocomplete: 'name',
    })
  ).toBe(0);
  expect(
    personalFieldScore('Name', ['given-name'], {
      type: 'text',
      autocomplete: 'given-name',
    })
  ).toBe(2);
});

it('keeps a custom field name available alongside its fill mapping', () => {
  expect(
    personalFieldScore('Number', ['tel'], { type: 'text', label: 'Number' })
  ).toBe(2);
});

it('keeps a grouped input form and prefills every mapped value from one saved item', async () => {
  mockRecord.fields = [
    { name: 'Name', aliases: ['name'], value: 'Alex Example', secret: false },
    {
      name: 'Email',
      aliases: ['email'],
      value: 'alex@example.com',
      secret: false,
    },
    { name: 'Username', aliases: ['username'], value: 'alex01', secret: false },
    { name: 'Number', aliases: ['tel'], value: '+15555550100', secret: false },
  ];
  const fields = [
    { key: 'fullName', group: 'Profile', personalData: 'fullName' },
    {
      key: 'email',
      type: 'email' as const,
      group: 'Profile',
      personalData: 'email',
    },
    { key: 'username', group: 'Profile', personalData: 'username' },
    {
      key: 'phone',
      type: 'tel' as const,
      group: 'Contact',
      personalData: 'phone',
    },
  ];
  const values = {
    fullName: 'Alex Example',
    email: 'alex@example.com',
    username: 'alex01',
    phone: '+15555550100',
  };
  (showBrowserDialog as jest.Mock).mockResolvedValue({
    response: 1,
    inputValues: values,
    savedSources: { fullName: '0', email: '1', username: '2', phone: '3' },
  });
  expect(
    await requestBrowserInput({} as any, {
      ...options(),
      recipient: 'Form tools · Profile',
      fields,
      request: { type: 'input', fields },
    })
  ).toEqual(values);
  const inputs = (showBrowserDialog as jest.Mock).mock.calls[0][1].inputs;
  expect(inputs.map((input: any) => input.group)).toEqual([
    'Profile',
    'Profile',
    'Profile',
    'Contact',
  ]);
  expect(inputs.map((input: any) => input.value)).toEqual(
    Object.values(values)
  );
  expect(inputs.every((input: any) => input.saved.length === 4)).toBe(true);
});

it('offers other saved values for an unmatched mapped field without silently prefilling it', async () => {
  mockRecord.fields = [{ name: 'Name', value: 'Alex Example', secret: false }];
  (showBrowserDialog as jest.Mock).mockResolvedValue({
    response: 1,
    inputValues: { firstName: 'Alex' },
    savedSources: { firstName: '0' },
  });
  expect(
    await requestBrowserInput({} as any, {
      ...options(),
      recipient: 'Hook · Name',
      fields: [],
      request: {
        type: 'input',
        fields: [
          { key: 'firstName', group: 'Profile', personalData: 'firstName' },
        ],
      },
    })
  ).toEqual({ firstName: 'Alex' });
  const input = (showBrowserDialog as jest.Mock).mock.calls[0][1].inputs[0];
  expect(input.value).toBe('');
  expect(input.group).toBe('Profile');
  expect(input.saved).toEqual([
    { id: '0', label: 'Work · Name', value: 'Alex Example' },
  ]);
  expect(input.savedHint).toBeUndefined();
});

it('keeps values beyond the initial suggestions available for picker search', async () => {
  const records = ['one', 'two'].map((id) => ({
    id,
    kind: 'profile',
    title: id,
    fields: Array.from({ length: 25 }, (_, i) => ({
      name: `Custom ${i}`,
      value: `${id}-${i}`,
      secret: false,
    })),
  }));
  mockVault.matching.mockReturnValue(
    records.map((record) => ({ id: record.id }))
  );
  mockVault.records.mockReturnValue(records);
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 0 });
  await requestBrowserInput({} as any, {
    ...options(),
    recipient: 'Hook',
    fields: [],
    request: {
      type: 'input',
      fields: [{ key: 'value', personalData: 'custom' }],
    },
  });
  const choices = (showBrowserDialog as jest.Mock).mock.calls[0][1].inputs[0]
    .saved;
  expect(choices).toHaveLength(50);
  expect(choices.some((choice: any) => choice.value === 'two-24')).toBe(true);
});
