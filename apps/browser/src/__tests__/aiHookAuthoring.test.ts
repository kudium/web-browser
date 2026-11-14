/** @jest-environment node */
/* eslint-disable import/no-relative-packages */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AIHookAuthoring,
  readHookAuthoringReference,
} from '../main/aiHookAuthoring';
import {
  getGlobalHooks,
  globalHookHash,
  saveGlobalHooks,
} from '../main/globalHooks';
import { runActionSandbox } from '../main/hookActionSandbox';
import { createHookTestWindow } from '../main/hookTestWindow';
import { requestHookLanguage } from '../main/hookLanguage';
import { actionTemplates } from '../../../../packages/hooks/actions';
import {
  emptyDeveloperConfig,
  validDeveloperConfig,
} from '../browser/siteDeveloper';

jest.mock('electron', () => ({}));
jest.mock('../main/globalHooks', () => ({
  getGlobalHooks: jest.fn(),
  saveGlobalHooks: jest.fn(),
  globalHookHash: (value: unknown) =>
    jest
      .requireActual('crypto')
      .createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex'),
  validGlobalHooks: (value: any) =>
    value.hooks.length <= 20 &&
    jest.requireActual('../browser/siteDeveloper').validDeveloperConfig({
      enabled: value.enabled,
      before: '',
      after: '',
      css: '',
      hooks: value.hooks,
    }),
}));
jest.mock('../main/hookLanguage', () => ({
  hookAPIReference: () =>
    jest
      .requireActual('fs')
      .readFileSync(
        jest
          .requireActual('path')
          .resolve(__dirname, '../../.erb/resources/hook-api.txt'),
        'utf8'
      ),
  requestHookLanguage: jest.fn(async () => ({ diagnostics: [] })),
}));
jest.mock('../main/hookActionSandbox', () => ({ runActionSandbox: jest.fn() }));
jest.mock('../main/hookTestWindow', () => ({
  createHookTestWindow: jest.fn(),
}));
const hook = {
  id: 'test',
  name: 'My hook',
  enabled: true,
  path: '/*',
  before: '',
  after: '',
  css: '',
  exclusions: [],
  actions: [
    {
      id: 'fill',
      name: 'Fill',
      contexts: ['input'] as const as any,
      source: 'api.field.fill("sample");',
    },
  ],
};
const sample = {
  url: 'https://example.com/',
  title: 'Example',
  field: {
    key: 'a',
    type: 'email',
    label: 'Email',
    name: 'email',
    id: 'email',
    placeholder: '',
    autocomplete: 'email',
    required: true,
    value: '',
  },
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(config = { enabled: false, hooks: [hook] }) {
  let current = JSON.parse(JSON.stringify(config));
  (getGlobalHooks as jest.Mock).mockImplementation(() =>
    JSON.parse(JSON.stringify(current))
  );
  (saveGlobalHooks as jest.Mock).mockImplementation(
    (_profile, next, expected) => {
      if (hash(current) !== expected) throw new Error('Global hooks changed.');
      current = JSON.parse(JSON.stringify(next));
    }
  );
  const review = jest.fn(async (..._args: any[]) => {}),
    check = jest.fn();
  const service = new AIHookAuthoring({} as any, review);
  const signal = new AbortController().signal;
  return {
    service,
    signal,
    review,
    check,
    execute: (
      name: any,
      args: any,
      profile: string | null = 'work'
    ): Promise<any> =>
      service.execute(
        name,
        args,
        profile === null ? undefined : profile,
        signal,
        check
      ),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  (requestHookLanguage as jest.Mock).mockResolvedValue({ diagnostics: [] });
});

it('uses the editor declarations and exact shared action templates on demand', () => {
  const guide = readHookAuthoringReference();
  expect(guide.declarations).toBe(
    fs.readFileSync(
      path.resolve(__dirname, '../../.erb/resources/hook-api.txt'),
      'utf8'
    )
  );
  expect(guide.declarations).toContain('interface KudiumActionApi');
  expect(guide.declarations).toContain('required?: boolean');
  expect(guide.examples.map(({ id, ...action }) => action)).toEqual(
    actionTemplates
  );
});
it('saves one hook while preserving unrelated hooks, provenance and the master switch', async () => {
  const installed = {
    url: 'https://example.com/hook.json',
    contentHash: 'a'.repeat(64),
    packageId: 'original',
    package: {
      schemaVersion: 2,
      minimumBrowserVersion: '1.0.0',
      name: 'Original',
      description: 'Example',
      license: 'MIT',
      applicability: 'general',
      sites: [],
      path: '/*',
      lifecycle: { before: '', after: '', css: '' },
      actions: hook.actions,
    },
  };
  const config = {
    enabled: false,
    hooks: [
      { ...hook, installed } as any,
      { ...hook, id: 'other', name: 'Other' },
    ],
  };
  const { service, execute, review } = fixture(config);
  const state = await execute('read_global_hooks', {});
  const edited = {
    ...hook,
    name: 'Edited',
    sites: [{ host: 'example.com', includeSubdomains: false }],
  };
  const current = getGlobalHooks('work');
  await execute('save_global_hook', {
    hook: edited,
    expectedHash: globalHookHash(current),
    reason: 'Rename and restrict this hook',
  });
  expect(saveGlobalHooks).toHaveBeenCalledWith(
    'work',
    expect.objectContaining({
      enabled: false,
      hooks: [
        expect.objectContaining({
          name: 'Edited',
          sites: edited.sites,
          installed,
        }),
        config.hooks[1],
      ],
    }),
    globalHookHash(current)
  );
  expect(review.mock.calls[0][2]).toContain('sites');
  expect(state.hookScope).toBe('group');
  service.dispose();
});
it('rejects stale writes before review and concurrent changes during review', async () => {
  const { execute, review } = fixture();
  await expect(
    execute('save_global_hook', {
      hook,
      expectedHash: 'a'.repeat(64),
      reason: 'Edit',
    })
  ).rejects.toThrow('changed');
  expect(review).not.toHaveBeenCalled();
  const state = await execute('read_global_hooks', {});
  review.mockImplementation(async () => {
    (getGlobalHooks as jest.Mock).mockReturnValue({ enabled: true, hooks: [] });
    (saveGlobalHooks as jest.Mock).mockImplementation(() => {
      throw new Error('Global hooks changed.');
    });
  });
  await expect(
    execute('save_global_hook', {
      hook,
      expectedHash: state.expectedHash,
      reason: 'Edit',
    })
  ).rejects.toThrow('changed');
});
it('requires explicit browser scope without a group and reviews All groups', async () => {
  const { execute, review } = fixture();
  await expect(execute('read_global_hooks', {}, null)).rejects.toThrow(
    'group tab'
  );
  const state = await execute(
    'read_global_hooks',
    { hookScope: 'browser' },
    null
  );
  await execute(
    'save_global_hook',
    {
      hookScope: 'browser',
      hook,
      expectedHash: state.expectedHash,
      reason: 'Create for every group',
    },
    null
  );
  expect(saveGlobalHooks).toHaveBeenCalledWith(
    '@all-groups',
    expect.anything(),
    state.expectedHash
  );
  expect(review.mock.calls[0][1]).toContain('All groups');
});
it('validates lifecycle and action code using their editor language modes', async () => {
  const { execute } = fixture();
  (requestHookLanguage as jest.Mock).mockImplementation(async (input) => ({
    diagnostics:
      input.mode === 'action'
        ? [{ from: 0, to: 1, severity: 'error', message: 'Unknown API' }]
        : [],
  }));
  const output = await execute('test_hook', {
    testAction: 'validate',
    hook: { ...hook, after: 'log(context.url)' },
  });
  expect(output.valid).toBe(false);
  expect(output.executed).toBe(false);
  expect(requestHookLanguage).toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'lifecycle' })
  );
  expect(requestHookLanguage).toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'action' })
  );
  expect(runActionSandbox).not.toHaveBeenCalled();
});
it('dry-runs the real sandbox contract with fictional awaited input and applies nothing', async () => {
  const { execute, review } = fixture();
  (runActionSandbox as jest.Mock).mockImplementation(
    async (_action, _context, options) => {
      const answer = await options.request({
        type: 'input',
        fields: [
          {
            key: 'email',
            type: 'email',
            required: true,
            personalData: 'email',
          },
        ],
      });
      return [{ capability: 'field.write', input: answer.email }];
    }
  );
  const output = await execute('test_hook', {
    testAction: 'action',
    hook,
    actionId: 'fill',
    sampleContext: sample,
    sampleAnswers: [{ email: 'sample@example.com' }],
  });
  expect(output).toMatchObject({
    executed: true,
    applied: false,
    inputRequests: 1,
    commands: [{ capability: 'field.write', input: 'sample@example.com' }],
  });
  expect(review).not.toHaveBeenCalled();
  expect(saveGlobalHooks).not.toHaveBeenCalled();
});
it('checks visibility and restrictions and excludes password values from sample contexts', async () => {
  const { execute } = fixture();
  await expect(
    execute('test_hook', {
      testAction: 'action',
      hook,
      actionId: 'fill',
      sampleContext: {
        ...sample,
        field: { ...sample.field, type: 'password' },
      },
    })
  ).rejects.toThrow('not visible');
  await expect(
    execute('test_hook', {
      testAction: 'action',
      hook: {
        ...hook,
        sites: [{ host: 'other.com', includeSubdomains: false }],
      },
      actionId: 'fill',
      sampleContext: sample,
    })
  ).rejects.toThrow('does not match');
  (runActionSandbox as jest.Mock).mockResolvedValue([]);
  const passwordHook = {
    ...hook,
    actions: [{ ...hook.actions[0], contexts: ['password'] }],
  };
  await execute('test_hook', {
    testAction: 'action',
    hook: passwordHook,
    actionId: 'fill',
    sampleContext: {
      ...sample,
      selection: 'sample',
      field: { ...sample.field, type: 'password', value: 'sample' },
    },
  });
  expect(
    (runActionSandbox as jest.Mock).mock.calls[0][1].field
  ).not.toHaveProperty('value');
  expect((runActionSandbox as jest.Mock).mock.calls[0][1]).not.toHaveProperty(
    'selection'
  );
});
it('reuses the editor preview window with reviewed source, bounded logs and owned test IDs', async () => {
  const { execute, review, service } = fixture();
  const window = {
    isDestroyed: () => false,
    close: jest.fn(),
    once: jest.fn(),
  };
  let publish: any;
  (createHookTestWindow as jest.Mock).mockImplementation(
    (_host, _hook, _url, callback) => {
      publish = callback;
      return window;
    }
  );
  const receipt = await execute('test_hook', {
    testAction: 'page',
    hook,
    url: sample.url,
    reason: 'Try the hook on the sample website',
  });
  expect(review).toHaveBeenCalled();
  publish({
    url: sample.url,
    status: 'error',
    logs: [{ time: 1, level: 'error', message: 'Example error' }],
  });
  expect(
    await execute('test_hook', { testAction: 'status', testId: receipt.testId })
  ).toMatchObject({ status: 'error', logs: [{ message: 'Example error' }] });
  await expect(
    execute(
      'test_hook',
      { testAction: 'status', testId: receipt.testId },
      'different'
    )
  ).rejects.toThrow('unavailable');
  await execute('test_hook', { testAction: 'stop', testId: receipt.testId });
  expect(window.close).toHaveBeenCalled();
  service.dispose();
});
it('rejects malformed declarations and bounded sample payloads before execution', async () => {
  const { execute } = fixture();
  expect(validDeveloperConfig({ ...emptyDeveloperConfig, hooks: [hook] })).toBe(
    true
  );
  await expect(
    execute('test_hook', {
      testAction: 'validate',
      hook: {
        ...hook,
        actions: [{ ...hook.actions[0], contexts: ['unknown'] }],
      },
    })
  ).rejects.toThrow('Invalid');
  await expect(
    execute('test_hook', {
      testAction: 'action',
      hook,
      actionId: 'fill',
      sampleContext: { ...sample, pageText: 'x'.repeat(100001) },
    })
  ).rejects.toThrow('Invalid');
  expect(runActionSandbox).not.toHaveBeenCalled();
});

it('does not save after declined review or a revoked group binding', async () => {
  const { execute, review, check } = fixture();
  const state = await execute('read_global_hooks', {});
  review.mockRejectedValueOnce(new Error('User declined'));
  await expect(
    execute('save_global_hook', {
      hook,
      expectedHash: state.expectedHash,
      reason: 'Edit',
    })
  ).rejects.toThrow('declined');
  expect(saveGlobalHooks).not.toHaveBeenCalled();
  review.mockImplementationOnce(async () => {
    check.mockImplementation(() => {
      throw new Error('Group changed');
    });
  });
  await expect(
    execute('save_global_hook', {
      hook,
      expectedHash: state.expectedHash,
      reason: 'Edit',
    })
  ).rejects.toThrow('Group changed');
  expect(saveGlobalHooks).not.toHaveBeenCalled();
});
it('handles simulated input cancellation and rejects malformed sample answers', async () => {
  const { execute } = fixture();
  (runActionSandbox as jest.Mock).mockImplementation(
    async (_action, _context, options) => {
      const data = await options.request({
        type: 'input',
        fields: [{ key: 'question', required: true }],
      });
      return data === null
        ? []
        : [{ capability: 'result', input: data.question }];
    }
  );
  expect(
    await execute('test_hook', {
      testAction: 'action',
      hook,
      actionId: 'fill',
      sampleContext: sample,
      sampleAnswers: [null],
    })
  ).toMatchObject({ applied: false, commands: [] });
  await expect(
    execute('test_hook', {
      testAction: 'action',
      hook,
      actionId: 'fill',
      sampleContext: sample,
      sampleAnswers: [{ invented: 'sample' }],
    })
  ).rejects.toThrow();
  expect(saveGlobalHooks).not.toHaveBeenCalled();
});

it('rejects malformed authored code before review and checks CSS in validation', async () => {
  const { execute, review } = fixture();
  const state = await execute('read_global_hooks', {});
  await expect(execute('save_global_hook', { hook: { ...hook, after: 'const broken = ;' }, expectedHash: state.expectedHash, reason: 'Broken draft' })).rejects.toThrow('After load, line 1');
  expect(review).not.toHaveBeenCalled();
  expect(saveGlobalHooks).not.toHaveBeenCalled();
  const output = await execute('test_hook', { testAction: 'validate', hook: { ...hook, css: 'p { color: red;' } });
  expect(output.valid).toBe(false);
  expect(output.cssChecked).toBe(true);
  expect(output.syntaxErrors).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'css' })]));
});
