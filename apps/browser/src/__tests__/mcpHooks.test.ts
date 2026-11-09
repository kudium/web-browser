/** @jest-environment node */
import { mcpArguments } from '../main/mcp';

const developer = {
  enabled: true,
  before: '',
  after: "console.log('Hook test');",
  css: '',
};
const args = {
  tabId: 'page',
  developer,
  reason: 'User requested a logging hook',
};
it('accepts a minimal JavaScript hook object from external AI', () => {
  expect(mcpArguments('configure_site_hooks', args).args).toEqual(args);
});
it('accepts named hooks and a notification binding', () => {
  const value = {
    ...args,
    developer: {
      ...developer,
      hooks: [
        {
          ...developer,
          id: 'listing',
          name: 'Listing JSON',
          path: '/listings/*',
        },
      ],
    },
    notification: {
      key: 'listing',
      recordId: 'saved-record',
      fieldName: 'webhook',
      recipientField: 'chat',
    },
  };
  expect(mcpArguments('configure_site_hooks', value).args).toEqual(value);
});
it.each([
  'console.log(1)',
  { enabled: true, after: 'console.log(1)' },
  { ...developer, after: 'x'.repeat(20001) },
  { ...developer, extra: true },
  {
    ...developer,
    hooks: [
      { ...developer, id: 'bad', name: 'Bad', path: 'https://other.test' },
    ],
  },
])('rejects malformed developer payloads', (value) => {
  expect(() =>
    mcpArguments('configure_site_hooks', { ...args, developer: value })
  ).toThrow(/developer/);
});
it.each([
  'invalid',
  { key: 'Wrong Key', recordId: 'record', fieldName: 'hook' },
  { key: 'valid', recordId: 'record', fieldName: 'hook', secret: 'value' },
])('rejects malformed notification bindings', (notification) => {
  expect(() =>
    mcpArguments('configure_site_hooks', { ...args, notification })
  ).toThrow(/notification/);
});

it.each([true, false])(
  'accepts explicit session sharing: %s',
  (shareSession) => {
    const value = {
      name: 'Work',
      url: 'https://example.com',
      tabId: 'source',
      shareSession,
    };
    expect(mcpArguments('create_group', value).args).toEqual(value);
  }
);
it('accepts interval tasks with full-length instructions and long dialog replies', () => {
  const task = {
    name: 'Check page',
    instructions: 'x'.repeat(12000),
    scheduleKind: 'interval',
    intervalMinutes: 15,
  };
  expect(mcpArguments('create_task', task).args).toEqual(task);
  const dialog = {
    dialogId: 'dialog',
    accept: true,
    promptText: 'x'.repeat(10000),
  };
  expect(mcpArguments('handle_dialog', dialog).args).toEqual(dialog);
});
it.each([0, 525601, 1.5, '15'])(
  'rejects invalid interval minutes: %s',
  (intervalMinutes) => {
    expect(() =>
      mcpArguments('create_task', {
        name: 'Check',
        instructions: 'Check page',
        scheduleKind: 'interval',
        intervalMinutes,
      })
    ).toThrow(/intervalMinutes/);
  }
);
it.each([
  [
    'create_group',
    { name: 'Work', url: 'https://example.com', shareSession: 'true' },
  ],
  [
    'create_group',
    { name: 'Work', url: 'https://example.com', groupDisplay: 'invalid' },
  ],
  [
    'create_task',
    { name: 'Task', instructions: 'Check', scheduleKind: 'invalid' },
  ],
  [
    'create_task',
    {
      name: 'Task',
      instructions: 'Check',
      scheduleKind: 'daily',
      localTime: '25:99',
    },
  ],
  [
    'create_task',
    { name: 'Task', instructions: 'x'.repeat(12001), scheduleKind: 'manual' },
  ],
])('rejects arguments outside the published schema for %s', (name, value) => {
  expect(() => mcpArguments(name, value)).toThrow();
});
