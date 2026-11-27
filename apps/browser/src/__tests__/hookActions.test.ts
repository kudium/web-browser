/** @jest-environment node */
import { EventEmitter } from 'events';
import { dialog } from 'electron';
import { showBrowserDialog } from '../main/dialogs';
import { hookActionMenu } from '../main/hookActions';
import { runActionSandbox } from '../main/hookActionSandbox';
import {
  captureActionField,
  fillActionField,
  readActionFieldContext,
  fillActionForm,
} from '../main/hookActionField';
import { saveNoteWithActivity } from '../main/noteActivity';
import { requestBrowserInput } from '../main/browserInput';
import { fillActionPersonalData } from '../main/hookActionPersonalData';
import { saveActionForm } from '../main/hookActionSaveForm';
// eslint-disable-next-line import/no-relative-packages
import {
  validHookActions,
  validateActionCommands,
  type HookAction,
} from '../../../../packages/hooks/actions';
// eslint-disable-next-line import/no-relative-packages
import { parseHookPackage } from '../../../../packages/hooks/package';
import { emptyDeveloperConfig } from '../browser/siteDeveloper';
jest.mock('electron', () => ({ dialog: { showMessageBox: jest.fn() } }));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn(async () => ({response:0})) }));
jest.mock('../main/browserInput', () => ({ requestBrowserInput: jest.fn() }));
jest.mock('../main/hookActionPersonalData', () => ({
  fillActionPersonalData: jest.fn(),
}));
jest.mock('../main/hookActionSaveForm', () => ({ saveActionForm: jest.fn() }));
jest.mock('../main/hookActionSandbox', () => ({ runActionSandbox: jest.fn() }));
jest.mock('../main/hookActionField', () => ({
  captureActionField: jest.fn(),
  fillActionField: jest.fn(),
  readActionFieldContext: jest.fn(),
  fillActionForm: jest.fn(),
}));
jest.mock('../main/todos', () => ({ addTodo: jest.fn() }));
jest.mock('../main/noteActivity', () => ({ saveNoteWithActivity: jest.fn() }));
jest.mock('../main/activity', () => ({
  browserActivity: () => ({ create: jest.fn() }),
}));
jest.mock('../main/globalHooks', () => ({ effectiveHookConfig: jest.fn() }));
const action: HookAction = {
  id: 'selection',
  name: 'Explain',
  contexts: ['selection'],
  source: 'api.ai.compose(context.selection);',
};
const pkg = {
  schemaVersion: 2,
  minimumBrowserVersion: '1.0.0',
  name: 'Actions',
  description: 'An action hook',
  license: 'MIT',
  applicability: 'general',
  sites: [],
  path: '/*',
  lifecycle: { before: '', after: '', css: '' },
  actions: [action],
};
test('portable actions-only packages round-trip and reject unknown capabilities and settings', () => {
  expect(parseHookPackage(pkg).actions).toEqual([action]);
  expect(() => parseHookPackage({ ...pkg, schemaVersion: 1 })).toThrow(
    'schema version 2'
  );
  expect(validHookActions([{ ...action, permissions: ['vault.read'] }])).toBe(
    false
  );
  expect(validHookActions([{ ...action, contexts: ['any'] }])).toBe(false);
  expect(validHookActions([action, action])).toBe(false);
  expect(validHookActions([{ ...action, grants: ['selection.read'] }])).toBe(
    false
  );
  expect(() =>
    parseHookPackage({ ...pkg, grants: ['selection.read'] })
  ).toThrow('Unknown');
});
test('main-process output validation fails closed regardless of sandbox result', () => {
  expect(validateActionCommands([{ capability: 'personalData.saveForm' }])).toEqual([{ capability: 'personalData.saveForm' }]);
  expect(() => validateActionCommands([{ capability: 'personalData.saveForm', input: { password: 'secret' } }])).toThrow();
  expect(
    validateActionCommands([
      { capability: 'notes.create', input: { title: 'Note', body: 'Content' } },
    ])
  ).toHaveLength(1);
  expect(() => validateActionCommands([{ capability: 'vault.read' }])).toThrow(
    'Unsupported'
  );
  expect(() =>
    validateActionCommands(
      [{ capability: 'selection.read' }],
      ['selection.read']
    )
  ).toThrow('Unsupported');
  expect(() =>
    validateActionCommands(
      [{ capability: 'password.generate', input: 'leak' }],
      ['password.generate']
    )
  ).toThrow('no data');
  expect(() =>
    validateActionCommands(
      [
        {
          capability: 'notes.create',
          input: { title: 'No', body: 'No', noteId: 'other' },
        },
      ],
      ['notes.create']
    )
  ).toThrow('Invalid note');
  expect(() =>
    validateActionCommands(
      Array.from({ length: 11 }, () => ({ capability: 'result', input: 'x' })),
      []
    )
  ).toThrow('ten');
});
const window = { isDestroyed: () => false, webContents: { send: jest.fn() } };
let contents: any;
let config: any;
let unlocked = true;
const params = {
  selectionText: 'Selected text',
  isEditable: false,
  linkURL: '',
  frameURL: '',
  formControlType: 'none',
};
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};
function menu(patch = {}, preview = false) {
  return hookActionMenu(
    window as any,
    contents,
    { ...params, ...patch } as any,
    'profile',
    () =>
      unlocked
        ? { groupId: 'group', sourceId: 'tab', scope: 'scope' }
        : undefined,
    { config: () => config, preview }
  );
}
function click(items: any) {
  items[0].submenu
    .find((item: any) => typeof item.click === 'function')
    .click();
  return flush();
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  unlocked = true;
  contents = Object.assign(new EventEmitter(), {
    id: 1,
    mainFrame: {},
    getURL: () => 'https://example.com/page',
    getTitle: () => 'Example',
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: jest.fn(async () => 'Visible text'),
  });
  config = {
    ...emptyDeveloperConfig,
    enabled: true,
    hooks: [{ id: 'hook', name: 'Hook', actions: [action] }],
  };
  (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 });
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'ai.compose', input: 'Explain this' },
  ]);
  (captureActionField as jest.Mock).mockResolvedValue(true);
  (readActionFieldContext as jest.Mock).mockResolvedValue({
    field: { type: 'input-password' },
    form: { fields: [] },
  });
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});
test('menu matching never evaluates scripts; selection actions disappear without selection', () => {
  expect(menu()[0].label).toBe('Hooks');
  expect(runActionSandbox).not.toHaveBeenCalled();
  expect(menu({ selectionText: '' })).toEqual([]);
  expect(menu({ frame: {} })).toEqual([]);
  unlocked = false;
  expect(menu()).toEqual([]);
});
test('clicking runs an action directly without a permission dialog', async () => {
  await click(menu());
  expect(runActionSandbox).toHaveBeenCalled();
  expect(dialog.showMessageBox).not.toHaveBeenCalled();
});
test('clicked selection is scoped and AI output goes to the built-in composer', async () => {
  await click(menu());
  expect(runActionSandbox).toHaveBeenCalledWith(
    action,
    expect.objectContaining({
      selection: 'Selected text',
      url: 'https://example.com/page',
    }),
    expect.objectContaining({
      request: expect.any(Function),
      signal: expect.anything(),
    })
  );
  expect((runActionSandbox as jest.Mock).mock.calls[0][1].pageText).toBe(
    'Visible text'
  );
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-ai-selection',
    'Explain this'
  );
});
test('navigation or disabled actions invalidate a pending invocation', async () => {
  const items = menu();
  contents.emit(
    'did-start-navigation',
    {},
    'https://example.com/other',
    true,
    true
  );
  await click(items);
  expect(runActionSandbox).not.toHaveBeenCalled();
  const fresh = menu();
  config.hooks = [];
  await click(fresh);
  expect(runActionSandbox).not.toHaveBeenCalled();
});
test('password generation never passes field contents or the password to the handler', async () => {
  const password = {
    ...action,
    contexts: ['password'],
    permissions: ['password.generate'],
  };
  config.hooks[0].actions = [password];
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'password.generate' },
  ]);
  await click(
    menu({
      isEditable: true,
      formControlType: 'input-password',
      selectionText: 'secret',
    })
  );
  const context = (runActionSandbox as jest.Mock).mock.calls[0][1];
  expect(context.selection).toBeUndefined();
  expect(context.field).toEqual({ type: 'input-password' });
  expect(fillActionField).toHaveBeenCalledWith(
    contents,
    expect.any(String),
    expect.stringMatching(/^.{24}$/),
    true
  );
});
test('test-window notes are previewed without writing private stores', async () => {
  config.hooks[0].actions = [{ ...action, permissions: ['notes.create'] }];
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'notes.create', input: { title: 'Note', body: 'Content' } },
  ]);
  await click(menu({}, true));
  expect(saveNoteWithActivity).not.toHaveBeenCalled();
  expect(dialog.showMessageBox).toHaveBeenCalledWith(
    window,
    expect.objectContaining({ message: 'Note preview' })
  );
});

test('a disabled master switch prevents effects from an already-running handler', async () => {
  let finish: (commands: unknown[]) => void = () => {};
  (runActionSandbox as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await click(menu());
  config = { ...config, enabled: false };
  finish([{ capability: 'ai.compose', input: 'Stale output' }]);
  await flush();
  expect(window.webContents.send).not.toHaveBeenCalled();
});
test('large action sets are grouped by hook rather than crowding one menu', () => {
  config.hooks[0].actions = Array.from({ length: 9 }, (_, i) => ({
    ...action,
    id: `action${i}`,
    name: `Action ${i}`,
  }));
  const items = menu();
  expect((items[0].submenu as any)[0].label).toBe('Hook');
  expect((items[0].submenu as any)[0].submenu).toHaveLength(9);
});

test('script-looking menu labels are data and never run while opening the menu', () => {
  const literal = 'api.passwords.fill("not executed")';
  config.hooks[0].actions = [{ ...action, name: literal }];
  expect((menu()[0].submenu as any).find((item: any) => item.click).label).toBe(
    literal
  );
  expect(runActionSandbox).not.toHaveBeenCalled();
});
test('custom password scripts fill only a password target and read metadata only after the click', async () => {
  config.hooks[0].actions = [
    {
      ...action,
      contexts: ['password'],
      permissions: ['field.read', 'password.write'],
    },
  ];
  (readActionFieldContext as jest.Mock).mockResolvedValue({
    field: {
      key: 'f0',
      type: 'password',
      label: 'New password',
      maxLength: 32,
    },
  });
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'password.write', input: 'CustomGeneratedValue' },
  ]);
  const items = menu({ isEditable: true, formControlType: 'input-password' });
  expect(readActionFieldContext).not.toHaveBeenCalled();
  await click(items);
  expect(runActionSandbox).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      field: expect.objectContaining({ label: 'New password', maxLength: 32 }),
    }),
    expect.objectContaining({ request: expect.any(Function) })
  );
  expect(fillActionField).toHaveBeenCalledWith(
    contents,
    expect.any(String),
    'CustomGeneratedValue',
    true
  );
  jest.clearAllMocks();
  config.hooks[0].actions[0].contexts = ['input'];
  await click(menu({ isEditable: true, formControlType: 'input-text' }));
  expect(fillActionField).not.toHaveBeenCalled();
});
test('form metadata, values and writes are scoped to the clicked form without confirmation', async () => {
  config.hooks[0].actions = [
    {
      ...action,
      contexts: ['input'],
      permissions: ['form.read', 'form.write'],
    },
  ];
  const field = {
    key: 'f0',
    type: 'email',
    label: 'Email',
    value: 'current@example.com',
  };
  (readActionFieldContext as jest.Mock).mockResolvedValue({
    field,
    form: { fields: [field] },
  });
  (runActionSandbox as jest.Mock).mockResolvedValue([
    {
      capability: 'form.write',
      input: [{ key: 'f0', value: 'hello@example.com' }],
    },
  ]);
  await click(menu({ isEditable: true, formControlType: 'input-text' }));
  expect(readActionFieldContext).toHaveBeenCalledWith(
    contents,
    expect.any(String),
    true
  );
  expect(fillActionForm).toHaveBeenCalledWith(contents, expect.any(String), [
    { key: 'f0', value: 'hello@example.com' },
  ]);
  expect(runActionSandbox).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ form: { fields: [field] } }),
    expect.objectContaining({ request: expect.any(Function) })
  );
  expect(dialog.showMessageBox).not.toHaveBeenCalled();
});
test('form output rejects selectors, duplicates, excess values and unsupported commands', () => {
  expect(
    validateActionCommands(
      [{ capability: 'form.write', input: [{ key: 'f0', value: 'OK' }] }],
      ['form.write']
    )
  ).toHaveLength(1);
  for (const input of [
    [{ key: '#email', value: 'No' }],
    [
      { key: 'f0', value: 'One' },
      { key: 'f0', value: 'Two' },
    ],
    [{ key: 'f0', value: 'x'.repeat(10001) }],
  ]) {
    expect(() =>
      validateActionCommands(
        [{ capability: 'form.write', input }],
        ['form.write']
      )
    ).toThrow('Invalid form');
  }
  expect(
    validateActionCommands([{ capability: 'password.write', input: 'Custom' }])
  ).toHaveLength(1);
});

test('notes and activity save immediately without an extra confirmation', async () => {
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'notes.create', input: { title: 'Note', body: 'Body' } },
  ]);
  await click(menu());
  expect(saveNoteWithActivity).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Note', notes: 'Body' }),
    'scope',
    expect.anything(),
    'https://example.com/page'
  );
  expect(dialog.showMessageBox).not.toHaveBeenCalled();
});
test('legacy declarations are accepted but omitted from portable packages', () => {
  const legacy = { ...action, permissions: ['selection.read'] };
  expect(validHookActions([legacy])).toBe(true);
  expect(parseHookPackage({ ...pkg, actions: [legacy] }).actions?.[0]).toEqual(
    action
  );
});
test('Save form works on password inputs and previews without touching Personal Data', async () => {
  config.hooks[0].actions = [{ ...action, contexts: ['input', 'password'], source: 'api.personalData.saveForm();' }];
  (runActionSandbox as jest.Mock).mockResolvedValue([{ capability: 'personalData.saveForm' }]);
  await click(menu({ isEditable: true, formControlType: 'input-password' }));
  expect(saveActionForm).toHaveBeenCalledWith(expect.objectContaining({ contents, scope: 'scope', url: 'https://example.com/page' }));
  jest.clearAllMocks();
  await click(menu({ isEditable: true, formControlType: 'input-password' }, true));
  expect(saveActionForm).not.toHaveBeenCalled();
  expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: 'Save form preview' }));
});
test('Save form appears on page clicks and dispatches browser-owned form discovery', async () => {
  config.hooks[0].actions = [{ ...action, contexts: ['page', 'input', 'password'], source: 'api.personalData.saveForm();' }];
  (runActionSandbox as jest.Mock).mockResolvedValue([{ capability: 'personalData.saveForm' }]);
  await click(menu());
  expect(saveActionForm).toHaveBeenCalledWith(expect.objectContaining({ page: true, contents, scope: 'scope' }));
  expect(captureActionField).not.toHaveBeenCalled();
});
test('Personal Data commands use the browser picker and cannot specify private records', async () => {
  config.hooks[0].actions = [
    { ...action, contexts: ['input'], source: 'api.personalData.fill();' },
  ];
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'personalData.fill' },
  ]);
  await click(menu({ isEditable: true, formControlType: 'input-text' }));
  expect(fillActionPersonalData).toHaveBeenCalledWith(
    expect.objectContaining({
      contents,
      scope: 'scope',
      url: 'https://example.com/page',
      check: expect.any(Function),
    })
  );
  expect(() =>
    validateActionCommands([
      { capability: 'personalData.fill', input: { recordId: 'secret' } },
    ])
  ).toThrow('no record');
  jest.clearAllMocks();
  await click(menu({ isEditable: true, formControlType: 'input-text' }, true));
  expect(fillActionPersonalData).not.toHaveBeenCalled();
});

test('default password generation respects the clicked input’s length limits', async () => {
  config.hooks[0].actions = [
    {
      ...action,
      contexts: ['password'],
      source: 'api.passwords.generateAndFill();',
    },
  ];
  (readActionFieldContext as jest.Mock).mockResolvedValue({
    field: { type: 'password', maxLength: 12, minLength: 8 },
  });
  (runActionSandbox as jest.Mock).mockResolvedValue([
    { capability: 'password.generate' },
  ]);
  await click(menu({ isEditable: true, formControlType: 'input-password' }));
  expect(fillActionField).toHaveBeenCalledWith(
    contents,
    expect.any(String),
    expect.stringMatching(/^.{12}$/),
    true
  );
});

test('password-only actions appear exclusively on editable password inputs', () => {
  config.hooks[0].actions = [
    {
      ...action,
      contexts: ['password'],
      source: 'api.passwords.generateAndFill();',
    },
  ];
  expect(
    menu({ isEditable: true, formControlType: 'input-password' })
  ).toHaveLength(1);
  expect(menu({ isEditable: true, formControlType: 'input-text' })).toEqual([]);
  expect(
    menu({ isEditable: false, formControlType: 'input-password' })
  ).toEqual([]);
  expect(menu({ isEditable: false, formControlType: 'none' })).toEqual([]);
});
test('text-field actions are hidden on password fields and unsupported controls', () => {
  config.hooks[0].actions = [
    { ...action, contexts: ['input'], source: 'api.field.fill("text");' },
  ];
  expect(
    menu({ isEditable: true, formControlType: 'input-email' })
  ).toHaveLength(1);
  expect(menu({ isEditable: true, formControlType: 'input-password' })).toEqual(
    []
  );
  expect(menu({ isEditable: true, formControlType: 'input-date' })).toEqual([]);
});

test('awaited requests use the live scope, revalidate afterwards, and use sample input in preview', async () => {
  let requestRun = Promise.resolve();
  const request = { type: 'personalData', fields: ['firstName'] };
  (requestBrowserInput as jest.Mock).mockResolvedValue({
    firstName: 'Alex',
  });
  (runActionSandbox as jest.Mock).mockImplementationOnce((_a, _c, broker) => {
    requestRun = (async () => {
      expect(
        await broker.request(request, new AbortController().signal)
      ).toEqual({ firstName: 'Alex' });
      expect(requestBrowserInput).toHaveBeenCalledWith(
        window,
        expect.objectContaining({
          scope: 'scope',
          recipient: 'Hook · Explain',
          request,
        })
      );
      (requestBrowserInput as jest.Mock).mockImplementationOnce(async () => {
        config.hooks = [];
        return { firstName: 'Alex' };
      });
      await expect(
        broker.request(request, new AbortController().signal)
      ).rejects.toThrow('disabled');
      config.hooks = [{ id: 'hook', name: 'Hook', actions: [action] }];
    })();
    return requestRun.then(() => []);
  });
  await click(menu());
  await requestRun; // Propagate assertions even though the menu handles action errors.
  expect(requestBrowserInput).toHaveBeenCalledTimes(2);
  (requestBrowserInput as jest.Mock).mockResolvedValue({ firstName: 'Sample' });
  (runActionSandbox as jest.Mock).mockImplementationOnce((_a, _c, broker) => {
    requestRun = (async () => {
      expect(
        await broker.request(request, new AbortController().signal)
      ).toEqual({ firstName: 'Sample' });
      expect(requestBrowserInput).toHaveBeenCalledWith(
        window,
        expect.objectContaining({
          fields: ['firstName'],
          detail: expect.stringContaining('sample'),
        })
      );
    })();
    return requestRun.then(() => []);
  });
  await click(menu({}, true));
  await requestRun;
  expect(requestBrowserInput).toHaveBeenCalledTimes(3);
});

test('groups small menus beneath one heading per hook without repeated subtitles', () => {
  config.hooks = [
    {
      id: 'one',
      name: 'Default hook',
      actions: [action, { ...action, id: 'second', name: 'Summarize' }],
    },
    {
      id: 'two',
      name: 'Form tools',
      actions: [{ ...action, id: 'third', name: 'Prepare input' }],
    },
  ];
  const submenu = menu()[0].submenu as any[];
  expect(submenu.map((item) => item.label || item.type)).toEqual([
    'Default hook',
    'Explain',
    'Summarize',
    'Form tools',
    'Prepare input',
  ]);
  expect(submenu.filter((item) => item.enabled === false)).toHaveLength(2);
  expect(submenu.every((item) => !item.sublabel)).toBe(true);
  expect(runActionSandbox).not.toHaveBeenCalled();
});

test('action failures show the browser error dialog without a native alert', async () => {
  (runActionSandbox as jest.Mock).mockRejectedValueOnce(new Error('Fixture failed'));
  await click(menu());
  expect(showBrowserDialog).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({message:'Hook action could not run',detail:expect.stringContaining('Fixture failed'),buttons:['Close']}));
  expect(dialog.showMessageBox).not.toHaveBeenCalled();
});


test('validates todo creation outputs from declarative hook actions', () => {
  const action: HookAction = {id:'todo',name:'Save a task',contexts:['page'],source:'',permissions:['todos.create']};
  expect(validateActionCommands([{capability:'todos.create',input:{key:'follow-up',title:'Follow up',today:true}}],action.permissions)).toHaveLength(1);
  expect(()=>validateActionCommands([{capability:'todos.create',input:{key:'follow-up',title:'',today:true}}],action.permissions)).toThrow();
});
