/** @jest-environment node */
import {
  AppleEngineEscalation,
  appleEngineTurn,
  buildEngineFrame,
  engineObservation,
  engineReceipts,
  engineState,
  enginePhase,
  stepToToolCall,
} from '../main/aiAppleEngineLoop';

const call = (id: string, name: string, args: Record<string, unknown>) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});
const result = (id: string, content: unknown) => ({
  role: 'tool',
  tool_call_id: id,
  content: typeof content === 'string' ? content : JSON.stringify(content),
});
const page = {
  url: 'https://app.test/settings',
  title: 'Settings',
  snapshotId: 'snap-1',
  text: 'Settings page',
  elements: [
    { id: 1, role: 'link', label: 'Home' },
    { id: 2, role: 'textbox', label: 'Display name', value: 'Sam' },
    { id: 3, role: 'button', label: 'Save changes' },
    ...Array.from({ length: 60 }, (_, index) => ({ id: 10 + index, role: 'link', label: `Item ${index}` })),
  ],
};

it('builds receipts, a deterministic state summary and a focused observation', () => {
  const messages = [
    { role: 'user', content: 'Change the display name to Alex and save' },
    call('c1', 'read_page', { tabId: 't1', format: 'compact' }),
    result('c1', page),
    call('c2', 'type', { elementId: 2, snapshotId: 'snap-1', text: 'Alex' }),
    result('c2', 'Error: Stale snapshot.'),
  ];
  const receipts = engineReceipts(messages);
  expect(receipts.map((receipt) => [receipt.name, receipt.ok])).toEqual([
    ['read_page', true],
    ['type', false],
  ]);
  const state = engineState(receipts);
  expect(state).toContain('1. read_page() → ok: url=https://app.test/settings title=Settings 63 controls');
  expect(state).toContain('2. type(elementId=2,text=Alex) → failed');
  expect(state.length).toBeLessThanOrEqual(800);
  const observation = engineObservation('Change the display name to Alex and save', receipts);
  expect(observation).toContain('@2 [textbox] "Display name" value=Sam');
  expect(observation).toContain('@3 [button] "Save changes"');
  expect(observation).toContain('more controls not shown');
  expect(observation.split('\n').length).toBeLessThanOrEqual(42);
  expect(engineObservation('x', [])).toBe('Nothing observed yet.');
});

it('chooses the phase from engine state, never from the model', () => {
  const goal = 'Change the display name and save';
  expect(enginePhase(goal, [])).toBe('observe');
  const read = engineReceipts([call('c1', 'read_page', {}), result('c1', page)]);
  expect(enginePhase(goal, read)).toBe('act');
  expect(enginePhase('What is on this page?', read)).toBe('answer');
  expect(enginePhase('Go to https://x.test and read it', [])).toBe('navigate');
  const pending = engineReceipts([call('c1', 'click', {}), result('c1', { pending: true, dialog: {} })]);
  expect(enginePhase(goal, pending)).toBe('handoff');
  const frame = buildEngineFrame(goal, read);
  expect(frame.choices.map((choice) => choice.action)).toEqual(['click', 'type', 'press', 'select', 'read', 'answer']);
  expect(frame.instructions.length).toBeLessThan(1000);
});

it('maps guided steps onto ordinary tool calls using the latest snapshot', () => {
  const receipts = engineReceipts([call('c1', 'read_page', {}), result('c1', page)]);
  expect(stepToToolCall({ action: 'type', target: '@2', text: 'Alex' }, receipts, 't1')).toEqual({
    tool: 'type',
    args: { elementId: 2, snapshotId: 'snap-1', tabId: 't1', text: 'Alex' },
  });
  expect(stepToToolCall({ action: 'click', target: '3' }, receipts)).toEqual({
    tool: 'click',
    args: { elementId: 3, snapshotId: 'snap-1' },
  });
  expect(stepToToolCall({ action: 'navigate', text: 'https://x.test' }, [], 't1')).toEqual({
    tool: 'navigate',
    args: { tabId: 't1', url: 'https://x.test' },
  });
  expect(stepToToolCall({ action: 'answer', text: 'It says hello' }, receipts)).toEqual({ answer: 'It says hello' });
  expect(() => stepToToolCall({ action: 'click', target: 'Save' }, receipts)).toThrow('target like @12');
  expect(() => stepToToolCall({ action: 'click', target: '@3' }, [])).toThrow('Read the page before');
});

it('runs a deterministic plan first, then one guided step, and escalates on repeats or overflow', async () => {
  const history = { lastSteps: [] as string[] };
  const tools = new Set(['run_script', 'read_page', 'type', 'click', 'hand_off']);
  const plan = await appleEngineTurn({
    messages: [{ role: 'user', content: 'Check if this page says "Saved"' }],
    availableTools: tools,
    step: async () => {
      throw new Error('should not be called');
    },
    history,
  });
  expect(plan.phase).toBe('plan');
  expect(plan.message.tool_calls?.[0].function.name).toBe('run_script');
  const step = jest.fn(async () => ({ action: 'type', target: '@2', text: 'Alex' }));
  const messages = [
    { role: 'user', content: 'Change the display name to Alex and save' },
    call('c1', 'read_page', {}),
    result('c1', page),
  ];
  const turn = await appleEngineTurn({ messages, tabId: 't1', availableTools: tools, step, history });
  expect(turn.phase).toBe('act');
  expect(JSON.parse(turn.message.tool_calls![0].function.arguments)).toEqual({
    elementId: 2,
    snapshotId: 'snap-1',
    tabId: 't1',
    text: 'Alex',
  });
  expect((step.mock.calls as unknown as [{ choices: unknown[] }][])[0][0].choices.length).toBe(6);
  await appleEngineTurn({ messages, tabId: 't1', availableTools: tools, step, history });
  await expect(
    appleEngineTurn({ messages, tabId: 't1', availableTools: tools, step, history })
  ).rejects.toBeInstanceOf(AppleEngineEscalation);
  const overflow = Object.assign(new Error('too big'), { code: 'context_limit' });
  await expect(
    appleEngineTurn({
      messages,
      availableTools: tools,
      step: async () => {
        throw overflow;
      },
      history: { lastSteps: [] },
    })
  ).rejects.toThrow('next tier');
  await expect(
    appleEngineTurn({
      messages,
      availableTools: tools,
      step: async () => ({ action: 'answer', text: 'done', done: true }),
      history: { lastSteps: [] },
    })
  ).rejects.toThrow('without a matching action receipt');
});
