import { conversationAIContext } from '../main/aiConversationContext';
import { AIExecutionTracker } from '../main/aiExecution';
import type { AIConversationEvent } from '../browser/aiConversations';

test('retains the original request beyond six messages and whole trailing constraints', () => {
  const root = `${'Long original request. '.repeat(
    250
  )}Preserve the existing sign-in flow.`;
  const history: AIConversationEvent[] = [{ type: 'user', text: root }];
  for (let i = 0; i < 10; i += 1)
    history.push(
      { type: 'user', text: `Correction ${i}` },
      { type: 'message', text: `Reply ${i}` }
    );
  const context = conversationAIContext(history);
  expect(
    context.messages.find((message) => message.role === 'user')?.content
  ).toBe(root);
  expect(
    context.messages.some((message) => message.content === 'Correction 9')
  ).toBe(true);
  expect(
    context.messages.some((message) => message.content === 'Reply 9')
  ).toBe(true);
});

test('marks omissions explicitly without cutting selected messages', () => {
  const history: AIConversationEvent[] = Array.from({ length: 12 }, (_, i) => ({
    type: i % 2 ? 'message' : 'user',
    text: `${i} ${'text '.repeat(500)}`,
  }));
  const context = conversationAIContext(history, 8000);
  expect(context.notice).toContain('outside the AI context');
  const selected = context.messages.filter(
    (message) => message.role !== 'system'
  );
  selected.forEach((message) =>
    expect(history.some((event) => event.text === message.content)).toBe(true)
  );
  expect(selected[0].content).toBe(history[0].text);
  expect(selected.at(-1)?.content).toBe(history.at(-1)?.text);
});

test('strips suggestions from earlier replies and keeps a simple chat intact', () => {
  const context = conversationAIContext([
    { type: 'user', text: 'Help' },
    {
      type: 'message',
      text: 'Done.\n```kudium-suggestions\n["Next step"]\n```',
    },
  ]);
  expect(context.messages).toEqual([
    { role: 'user', content: 'Help' },
    { role: 'assistant', content: 'Done.' },
  ]);
  expect(context.notice).toBe('');
});

test('separates observations, applied effects, verified writes and started commands', () => {
  const tracker = new AIExecutionTracker();
  tracker.record('read_page', {}, {});
  tracker.record('click', {}, 'Clicked');
  tracker.record(
    'project_files',
    { fileRequest: { action: 'save' } },
    { file: { version: 'saved-version' } }
  );
  tracker.record(
    'project_terminal',
    { terminalAction: 'run' },
    { terminal: { selected: 'terminal1', running: true } }
  );
  expect(tracker.snapshot()).toMatchObject({
    observations: 1,
    applied: 1,
    verifiedWrites: 1,
    startedCommands: 1,
    reviewedCommands: 0,
    incomplete: true,
  });
  expect(tracker.pendingCommands()).toEqual(['terminal1']);
  tracker.record(
    'project_terminal',
    { terminalAction: 'read', terminalId: 'terminal1' },
    { data: 'Build passed', running: true }
  );
  expect(tracker.pendingCommands()).toEqual(['terminal1']);
  expect(tracker.snapshot().reviewedCommands).toBe(1);
  tracker.record('click', {}, { error: 'Declined' });
  expect(tracker.failed()).toBe(true);
});

test.each([0, 2])(
  'uses an exit receipt (%s), never arbitrary output, as command completion',
  (exitCode) => {
    const tracker = new AIExecutionTracker();
    tracker.record(
      'project_terminal',
      { terminalAction: 'run' },
      {
        terminal: { selected: 't', command: { id: 'c', status: 'running' } },
      }
    );
    tracker.record(
      'project_terminal',
      { terminalAction: 'read', terminalId: 't' },
      {
        data: 'SUCCESS exit 0',
        command: { id: 'unrelated', status: 'completed', exitCode: 0 },
      }
    );
    expect(tracker.snapshot().incomplete).toBe(true);
    tracker.record(
      'project_terminal',
      { terminalAction: 'read', terminalId: 't' },
      {
        data: 'Output',
        command: { id: 'c', status: 'completed', exitCode },
      }
    );
    tracker.record('read_page', {}, {});
    expect(tracker.snapshot()).toMatchObject({
      successfulCommands: exitCode === 0 ? 1 : 0,
      failedCommands: exitCode === 0 ? 0 : 1,
      unfinishedCommands: 0,
      incomplete: exitCode !== 0,
    });
  }
);

test('interrupted commands remain failed after later successful observations', () => {
  const tracker = new AIExecutionTracker();
  tracker.record(
    'project_scripts',
    { scriptRequest: { action: 'run' } },
    {
      terminal: { selected: 't', command: { id: 'c', status: 'running' } },
    }
  );
  tracker.record(
    'project_terminal',
    { terminalAction: 'read', terminalId: 't' },
    {
      data: 'stopped',
      command: { id: 'c', status: 'interrupted' },
    }
  );
  tracker.record('read_page', {}, {});
  expect(tracker.failed()).toBe(true);
});

test('restores command receipts on resume without restarting the command', () => {
  const tracker = new AIExecutionTracker([
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'a',
          function: {
            name: 'project_terminal',
            arguments: '{"terminalAction":"run"}',
          },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'a',
      content: '{"terminal":{"selected":"terminal1"}}',
    },
  ]);
  expect(tracker.pendingCommands()).toEqual(['terminal1']);
  expect(tracker.snapshot().startedCommands).toBe(1);
});

test('does not count a pending page dialog as a completed action', () => {
  const tracker = new AIExecutionTracker();
  tracker.record('click', {}, { pending: true, dialog: { id: 'dialog1' } });
  expect(tracker.snapshot()).toMatchObject({
    applied: 0,
    pendingActions: 1,
    incomplete: true,
  });
  tracker.record('handle_dialog', { dialogId: 'dialog1' }, 'Dialog handled');
  expect(tracker.snapshot()).toMatchObject({
    applied: 1,
    pendingActions: 0,
    incomplete: false,
  });
});
