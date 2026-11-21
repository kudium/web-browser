import { Theme } from '@radix-ui/themes';
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AISidebar } from '../components/UI/AISidebar';
import type { MCPStatus } from '../browser/mcp';
import type { AIEvent, AITaskStatus } from '../browser/ai';
import type { AIQueueState } from '../browser/aiComposer';

beforeEach(() => {
  Object.assign(global, {
    ResizeObserver: jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    })),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: jest.fn(),
  });
});
function mockAI(
  status: Promise<AITaskStatus> = Promise.resolve({
    busy: false,
    resumable: false,
  })
) {
  let listener: (event: AIEvent) => void = () => {};
  let queueListener: (state: AIQueueState) => void = () => {};
  let externalListener: (externalStatus: MCPStatus) => void = () => {};
  const ai = {
    taskStatus: jest.fn().mockReturnValue(status),
    queue: jest.fn().mockResolvedValue({ messages: [], paused: false }),
    onQueue: (callback: typeof queueListener) => {
      queueListener = callback;
      return () => {};
    },
    settings: jest.fn().mockResolvedValue({
      endpoint: 'https://api.openai.com/v1',
      model: 'test',
      hasKey: true,
      remembered: false,
    }),
    mcpStatus: jest.fn().mockResolvedValue({ running: false }),
    onMCP: (callback: typeof externalListener) => {
      externalListener = callback;
      return () => {};
    },
    takeOver: jest.fn().mockResolvedValue(true),
    resumeExternal: jest.fn().mockResolvedValue(true),
    onSettings: () => () => {},
    onEvent: (callback: typeof listener) => {
      listener = callback;
      return () => {};
    },
    resume: jest.fn().mockResolvedValue(true),
    attachContext: jest.fn(),
    groups: jest.fn().mockResolvedValue({ groupId: null, groups: [] }),
    feedback: jest.fn().mockResolvedValue(true),
    run: jest.fn(),
  };
  Object.assign(window, { electron: { ai, browser: { onState: jest.fn(() => () => {}) } } });
  return {
    ai,
    event: (event: AIEvent) => listener(event),
    queueEvent: (state: AIQueueState) => queueListener(state),
    external: (externalStatus: MCPStatus) => externalListener(externalStatus),
  };
}

it.each(['error', 'handoff'] as const)(
  'continues after %s without resubmitting its prompt',
  async (type) => {
    const mock = mockAI();
    render(<AISidebar />);
    await screen.findByText('test');
    act(() => {
      mock.event({ type, text: 'Connection failed', resumable: true });
      mock.event({ type: 'done', text: '', resumable: true });
    });
    const recoveryLabel = type === 'error' ? 'Retry' : 'Continue task';
    fireEvent.click(screen.getByRole('button', { name: recoveryLabel }));
    await waitFor(() => expect(mock.ai.resume).toHaveBeenCalledTimes(1));
    expect(mock.ai.run).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Continue task' })
      ).not.toBeInTheDocument()
    );
    act(() => mock.event({ type: 'done', text: '' }));
    expect(
      screen.getByRole('button', { name: 'Send AI task' })
    ).toBeInTheDocument();
  }
);

it('restores the paused task and reason when the sidebar mounts again', async () => {
  const mock = mockAI(
    Promise.resolve({
      busy: false,
      resumable: true,
      reason: 'Complete login, then continue.',
    })
  );
  const first = render(<AISidebar />);
  await screen.findByRole('button', { name: 'Continue task' });
  first.unmount();
  render(<AISidebar />);
  await screen.findByRole('button', { name: 'Continue task' });
  expect(
    screen.getByText('Complete login, then continue.')
  ).toBeInTheDocument();
  expect(mock.ai.run).not.toHaveBeenCalled();
  expect(mock.ai.resume).not.toHaveBeenCalled();
});

it('does not let a late initial status overwrite a newer completed event', async () => {
  let resolveStatus: (status: AITaskStatus) => void = () => {};
  const mock = mockAI(
    new Promise((resolve) => {
      resolveStatus = resolve;
    })
  );
  render(<AISidebar />);
  await screen.findByText('test');
  act(() => {
    mock.event({ type: 'status', text: 'Working' });
    mock.event({ type: 'done', text: '' });
  });
  await act(async () => {
    resolveStatus({ busy: true, resumable: true, reason: 'Old state' });
  });
  expect(
    screen.queryByRole('button', { name: 'Continue task' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Stop AI task' })
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Old state')).not.toBeInTheDocument();
});

it.each(['resume', 'Please continue the task.', 'continue please'])(
  'routes "%s" to the paused task without replaying its prompt',
  async (prompt) => {
    const mock = mockAI(Promise.resolve({ busy: false, resumable: true }));
    render(<AISidebar />);
    await screen.findByRole('button', { name: 'Continue task' });
    await screen.findByText('test');
    fireEvent.change(screen.getByRole('textbox', { name: 'Task for AI' }), {
      target: { value: prompt },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
    await waitFor(() => expect(mock.ai.resume).toHaveBeenCalledTimes(1));
    expect(mock.ai.run).not.toHaveBeenCalled();
  }
);

it('keeps a different task explicit even while a checkpoint exists', async () => {
  const mock = mockAI(Promise.resolve({ busy: false, resumable: true }));
  render(<AISidebar />);
  await screen.findByRole('button', { name: 'Continue task' });
  await screen.findByText('test');
  fireEvent.change(screen.getByRole('textbox', { name: 'Task for AI' }), {
    target: { value: 'Continue researching a different topic' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
  await waitFor(() =>
    expect(mock.ai.run).toHaveBeenCalledWith(
      'Continue researching a different topic'
    )
  );
  expect(mock.ai.resume).not.toHaveBeenCalled();
});

it('keeps recovery available after a rejected continuation', async () => {
  const mock = mockAI(Promise.resolve({ busy: false, resumable: true }));
  mock.ai.resume.mockRejectedValueOnce(
    new Error('Restore the original provider')
  );
  render(<AISidebar />);
  await screen.findByRole('button', { name: 'Continue task' });
  await screen.findByText('test');
  fireEvent.click(screen.getByRole('button', { name: 'Continue task' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Restore the original provider'
  );
  expect(screen.getByRole('button', { name: 'Continue task' })).toBeEnabled();
  expect(mock.ai.run).not.toHaveBeenCalled();
});

it('restores completed replies after renderer recreation', async () => {
  mockAI(
    Promise.resolve({
      busy: false,
      resumable: false,
      history: [
        { type: 'message', text: 'Verified page title: Example Domain' },
      ],
    })
  );
  render(<AISidebar />);
  expect(
    await screen.findByText('Verified page title: Example Domain')
  ).toBeInTheDocument();
});

it('removes Continue when the authoritative completion clears recovery', async () => {
  const mock = mockAI(Promise.resolve({ busy: false, resumable: true }));
  render(<AISidebar />);
  await screen.findByRole('button', { name: 'Continue task' });
  act(() => mock.event({ type: 'done', text: '', resumable: false }));
  expect(
    screen.queryByRole('button', { name: 'Continue task' })
  ).not.toBeInTheDocument();
});

it('retains the draft and attachments after failed submission and retries once', async () => {
  const { ai } = mockAI();
  const file = {
    id: 'file-1',
    name: 'resume.pdf',
    size: 2048,
    kind: 'document',
  };
  Object.assign(ai, {
    pickAttachments: jest
      .fn()
      .mockResolvedValue({ attachments: [file], errors: [] }),
    removeAttachment: jest.fn().mockResolvedValue(true),
  });
  ai.run
    .mockRejectedValueOnce(new Error('Provider unavailable'))
    .mockResolvedValueOnce(true);
  render(<AISidebar />);
  await screen.findByText('test');
  fireEvent.click(screen.getByRole('button', { name: 'Attach context' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Upload files from computer' })
  );
  await screen.findByRole('listitem', { name: 'resume.pdf' });
  const input = screen.getByRole('textbox', { name: 'Task for AI' });
  fireEvent.change(input, { target: { value: 'Review my resume' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
  await screen.findByText('Provider unavailable');
  expect(input).toHaveValue('Review my resume');
  expect(
    screen.getByRole('button', { name: 'Remove resume.pdf' })
  ).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
  await waitFor(() => expect(ai.run).toHaveBeenCalledTimes(2));
  expect(ai.run).toHaveBeenLastCalledWith({
    prompt: 'Review my resume',
    attachmentIds: ['file-1'],
  });
  await waitFor(() => expect(input).toHaveValue(''));
  expect(
    screen.queryByRole('button', { name: 'Remove resume.pdf' })
  ).not.toBeInTheDocument();
});

it('deduplicates dropped browser references, replaces tabs with their group, and retains failed drafts', async () => {
  const { ai } = mockAI();
  Object.assign(ai, {
    attachContext: jest.fn().mockImplementation(({ kind, id }) =>
      Promise.resolve({
        kind,
        id,
        name: kind === 'group' ? 'Work' : 'Project',
        groupId: 'work',
        icon: '',
        tabCount: kind === 'group' ? 2 : 1,
      })
    ),
  });
  ai.run
    .mockRejectedValueOnce(new Error('Provider unavailable'))
    .mockResolvedValueOnce(true);
  render(<AISidebar />);
  await screen.findByText('test');
  const drop = (kind: string, id: string) =>
    fireEvent.drop(screen.getByRole('complementary'), {
      dataTransfer: {
        getData: () => JSON.stringify({ kind, id }),
        files: [],
        types: ['application/x-kudiumbrowser-ai-context'],
      },
    });
  drop('tab', 'one');
  await screen.findByRole('listitem', { name: 'Tab: Project' });
  drop('tab', 'one');
  await waitFor(() => expect(ai.attachContext).toHaveBeenCalledTimes(2));
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  drop('group', 'work');
  await screen.findByRole('listitem', { name: 'Group: Work' });
  expect(
    screen.queryByRole('listitem', { name: 'Tab: Project' })
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Task for AI' }), {
    target: { value: 'Summarize my project' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
  await screen.findByText('Provider unavailable');
  expect(
    screen.getByRole('listitem', { name: 'Group: Work' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
  await waitFor(() => expect(ai.run).toHaveBeenCalledTimes(2));
  expect(ai.run).toHaveBeenLastCalledWith({
    prompt: 'Summarize my project',
    attachmentIds: [],
    contextReferences: [{ kind: 'group', id: 'work' }],
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('listitem', { name: 'Group: Work' })
    ).not.toBeInTheDocument()
  );
});

it('requires a human scope change for an attached tab outside the selected group', async () => {
  const { ai } = mockAI();
  let scope = 'work';
  Object.assign(ai, {
    groups: jest.fn().mockImplementation((next) => {
      if (next !== undefined) scope = next;
      return Promise.resolve({
        groupId: scope,
        groups: [
          { id: 'home', name: 'Home', slug: 'home', tabs: [] },
          { id: 'work', name: 'Work', slug: 'work', tabs: [] },
        ],
      });
    }),
    attachContext: jest.fn().mockResolvedValue({
      kind: 'tab',
      id: 'mail',
      name: 'Mail',
      groupId: 'home',
      icon: '',
      tabCount: 1,
    }),
  });
  render(<AISidebar />);
  await screen.findByText('test');
  fireEvent.drop(screen.getByRole('complementary'), {
    dataTransfer: {
      getData: () => JSON.stringify({ kind: 'tab', id: 'mail' }),
      files: [],
      types: ['application/x-kudiumbrowser-ai-context'],
    },
  });
  await screen.findByRole('listitem', { name: 'Tab: Mail' });
  expect(screen.getByRole('button', { name: 'Send AI task' })).toBeDisabled();
  expect(ai.groups).not.toHaveBeenCalledWith('home');
  fireEvent.click(screen.getByRole('button', { name: 'Use Home' }));
  await waitFor(() => expect(ai.groups).toHaveBeenCalledWith('home'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send AI task' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove Mail context' }));
  expect(
    screen.queryByRole('listitem', { name: 'Tab: Mail' })
  ).not.toBeInTheDocument();
});

it('hides takeover for an idle external server and restores it only during activity or a pause', async () => {
  const mock = mockAI();
  render(<AISidebar />);
  await screen.findByText('test');
  const external = {
    enabled: true,
    running: true,
    paused: false,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  };
  act(() => mock.external(external));
  expect(
    screen.queryByRole('button', { name: 'Take control' })
  ).not.toBeInTheDocument();
  act(() =>
    mock.event({ type: 'status', source: 'external', text: 'Reading page' })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Take control' }));
  expect(mock.ai.takeOver).toHaveBeenCalledTimes(1);
  act(() => mock.event({ type: 'done', source: 'external', text: '' }));
  expect(
    screen.queryByRole('button', { name: 'Take control' })
  ).not.toBeInTheDocument();
  act(() => mock.external({ ...external, paused: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume external AI' }));
  expect(mock.ai.resumeExternal).toHaveBeenCalledTimes(1);
  act(() => mock.external(external));
  expect(
    screen.queryByRole('button', { name: 'Resume external AI' })
  ).not.toBeInTheDocument();
});

it.each([false, true])(
  'native webpage focus dismisses only unpinned chat history (pinned=%s)',
  async (pinned) => {
    localStorage.setItem('kudiumbrowser-ai-page-historyOpen', 'false');
    localStorage.setItem(
      'kudiumbrowser-ai-page-historyPinned',
      JSON.stringify(pinned)
    );
    localStorage.setItem('kudiumbrowser-ai-page-pane', '"assistant"');
    const mock = mockAI();
    Object.assign(mock.ai, {
      conversations: jest.fn().mockResolvedValue({
        selectedId: 'chat',
        conversations: [
          { id: 'chat', title: 'Saved task', updatedAt: 0, paused: false },
        ],
        history: [],
        draft: '',
      }),
    });
    let pageFocus: ((request: { action: string }) => void) | undefined;
    const onTabRequest = jest.fn((callback) => {
      pageFocus = callback;
      return () => {};
    });
    Object.assign(window.electron, { browser: { onTabRequest } });
    const view = render(<AISidebar />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Chat history' })
    );
    await screen.findByRole('complementary', { name: 'Chat history' });
    await waitFor(() =>
      expect(onTabRequest).toHaveBeenCalledTimes(pinned ? 0 : 1)
    );
    act(() => pageFocus?.({ action: 'select' }));
    await waitFor(() =>
      expect(
        !!screen.queryByRole('complementary', { name: 'Chat history' })
      ).toBe(pinned)
    );
    view.unmount();
    localStorage.removeItem('kudiumbrowser-ai-page-historyOpen');
    localStorage.removeItem('kudiumbrowser-ai-page-historyPinned');
    localStorage.removeItem('kudiumbrowser-ai-page-pane');
  }
);

it('replaces transient streaming text with one final reply and hides suggestion metadata', async () => {
  const mock = mockAI();
  render(<AISidebar />);
  await screen.findByText('test');
  act(() => {
    mock.event({ type: 'status', text: 'Thinking…' });
    mock.event({ type: 'partial', text: 'Working on it.\n```kudium-sug' });
  });
  expect(screen.getByLabelText('AI reply in progress')).toHaveTextContent(
    'Working on it.'
  );
  expect(screen.queryByText(/kudium-sug/)).toBeNull();
  act(() => {
    mock.event({ type: 'partial', text: '' });
    mock.event({ type: 'message', text: 'Finished.' });
    mock.event({ type: 'done', text: '' });
  });
  expect(screen.queryByLabelText('AI reply in progress')).toBeNull();
  expect(screen.getAllByText('Finished.')).toHaveLength(1);
  expect(screen.queryByText('Working on it.')).toBeNull();
});

it('discards a partial reply when the run stops', async () => {
  const mock = mockAI();
  render(<AISidebar />);
  await screen.findByText('test');
  act(() => {
    mock.event({ type: 'partial', text: 'Temporary reply' });
    mock.event({ type: 'error', text: 'Run stopped.' });
    mock.event({ type: 'done', text: '' });
  });
  expect(screen.queryByText('Temporary reply')).toBeNull();
  expect(screen.getByText('Run stopped.')).toBeInTheDocument();
});

it('shows persisted task notes and clears them without sending a new task', async () => {
  const mock = mockAI();
  const state = {
    selectedId: 'chat',
    conversations: [],
    history: [],
    draft: '',
    taskMemory: {
      decisions: ['Preserve the sign-in flow'],
      unfinished: ['Verify the edit'],
      sources: [],
    },
  };
  const conversations = jest.fn().mockResolvedValue(state);
  Object.assign(mock.ai, { conversations });
  render(<AISidebar />);
  await screen.findByText('Preserve the sign-in flow');
  expect(screen.getByText('Verify the edit')).toBeInTheDocument();
  conversations.mockResolvedValue({ ...state, taskMemory: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Clear task notes' }));
  await waitFor(() =>
    expect(conversations).toHaveBeenCalledWith({
      action: 'clear-memory',
      id: 'chat',
    })
  );
  await waitFor(() =>
    expect(screen.queryByText('Preserve the sign-in flow')).toBeNull()
  );
  expect(mock.ai.run).not.toHaveBeenCalled();
});

it('does not pull the reader to the bottom while they inspect earlier messages', async () => {
  const mock = mockAI();
  const scroll = jest.spyOn(HTMLElement.prototype, 'scrollTo');
  render(<AISidebar />);
  await screen.findByText('test');
  const log = screen.getByRole('log');
  Object.defineProperties(log, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
    scrollTop: { value: 0, writable: true },
  });
  fireEvent.scroll(log);
  scroll.mockClear();
  act(() => mock.event({ type: 'partial', text: 'New streamed text' }));
  expect(scroll).not.toHaveBeenCalled();
  expect(screen.getByLabelText('AI reply in progress')).toHaveAttribute(
    'aria-live',
    'off'
  );
  log.scrollTop = 800;
  fireEvent.scroll(log);
  act(() => mock.event({ type: 'partial', text: 'More streamed text' }));
  expect(scroll).toHaveBeenCalled();
  scroll.mockRestore();
});

it('answers an inline question using the existing composer and resumes the waiting run', async () => {
  const mock = mockAI();
  render(<AISidebar />);
  await screen.findByText('test');
  act(() => {
    mock.event({ type: 'status', text: 'Waiting for feedback' });
    mock.event({
      type: 'message',
      text: 'How should I proceed?',
      feedbackId: 'question-1',
      suggestions: ['Read the end'],
    });
    mock.event({ type: 'feedback', text: '', feedbackId: 'question-1' });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read the end' }));
  expect(screen.getByRole('textbox', { name: 'Task for AI' })).toHaveValue(
    'Read the end'
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Task for AI' }), {
    target: { value: 'Find the final paragraph' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() =>
    expect(mock.ai.feedback).toHaveBeenCalledWith(
      'question-1',
      'Find the final paragraph'
    )
  );
  expect(mock.ai.run).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Read the end' })).toBeDisabled());
  expect(
    screen.getByRole('button', { name: 'Stop AI task' })
  ).toBeInTheDocument();
});

it('clears an inline question when the waiting task stops', async () => {
  const mock = mockAI();
  render(<AISidebar />);
  await screen.findByText('test');
  act(() => {
    mock.event({ type: 'status', text: 'Waiting' });
    mock.event({
      type: 'message',
      text: 'Choose',
      feedbackId: 'question-2',
      suggestions: ['Continue reading'],
    });
    mock.event({ type: 'feedback', text: '', feedbackId: 'question-2' });
    mock.event({ type: 'feedback', text: '' });
    mock.event({ type: 'done', text: '' });
  });
  expect(
    screen.getByRole('button', { name: 'Continue reading' })
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Send AI task' })
  ).toBeInTheDocument();
});

it('shows undo at the bottom and restores the deleted chat', async () => {
  const mock = mockAI();
  const conversations = jest.fn().mockImplementation((request) =>
    Promise.resolve(
      request.action === 'undo-delete'
        ? {
            selectedId: 'deleted',
            conversations: [
              { id: 'deleted', title: 'My chat', updatedAt: 1, paused: false },
            ],
            history: [{ type: 'user', text: 'Restored history' }],
            draft: 'Saved draft',
          }
        : {
            selectedId: 'replacement',
            conversations: [
              {
                id: 'replacement',
                title: 'New chat',
                updatedAt: 2,
                paused: false,
              },
            ],
            history: [],
            draft: '',
            undoDeletion: {
              id: 'deleted',
              title: 'My chat',
              expiresAt: Date.now() + 10000,
            },
          }
    )
  );
  Object.assign(mock.ai, { conversations });
  render(<AISidebar />);
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(conversations).toHaveBeenCalledWith({
      action: 'undo-delete',
      id: 'deleted',
      draft: '',
    })
  );
  await screen.findByText('Restored history');
  expect(
    screen.queryByRole('button', { name: 'Undo' })
  ).not.toBeInTheDocument();
});

it.each([false, true])(
  'active tab context follows only fresh chats (ongoing: %s)',
  async (ongoing) => {
    const { ai } = mockAI();
    const groups = ['one', 'two'].map((id) => ({
      id,
      name: id,
      slug: id,
      tabs: [
        {
          id: `${id}-tab`,
          name: id,
          slug: id,
          url: 'https://example.com',
          icon: '',
        },
      ],
    }));
    ai.groups.mockImplementation((id) =>
      Promise.resolve({ groupId: id || null, groups })
    );
    ai.attachContext.mockImplementation(({ id }) =>
      Promise.resolve({
        kind: 'tab',
        id,
        name: id,
        groupId: id.split('-')[0],
        icon: '',
        tabCount: 1,
      })
    );
    Object.assign(ai, {
      conversations: jest.fn().mockResolvedValue({
        selectedId: 'chat',
        conversations: [
          { id: 'chat', title: 'Chat', updatedAt: 1, paused: false },
        ],
        history: ongoing
          ? [{ type: 'user', text: 'Existing conversation' }]
          : [],
        draft: '',
      }),
    });
    const { rerender } = render(<AISidebar activeTabId="one-tab" />);
    await screen.findByText('test');
    if (ongoing) await screen.findByText('Existing conversation');
    await waitFor(() =>
      expect(ai.attachContext).toHaveBeenCalledTimes(ongoing ? 0 : 1)
    );
    rerender(<AISidebar activeTabId="two-tab" />);
    await waitFor(() =>
      expect(ai.attachContext).toHaveBeenCalledTimes(ongoing ? 0 : 2)
    );
    expect(ai.attachContext.mock.calls.map(([ref]) => ref.id)).toEqual(
      ongoing ? [] : ['one-tab', 'two-tab']
    );
    expect(ai.groups.mock.calls.some(([id]) => id === 'two')).toBe(!ongoing);
  }
);

it.each(['shortcut', 'menu'] as const)(
  'switches pages after a Developer %s request',
  async (source) => {
    localStorage.removeItem('kudiumbrowser-ai-page-pane');
    const mock = mockAI();
    Object.assign(mock.ai, {
      tasks: jest.fn().mockResolvedValue([]),
      onTasks: () => () => {},
    });
    Object.assign(window.electron, {
      ipcRenderer: { on: () => () => {}, sendMessage: () => {} },
      passwordManager: jest.fn().mockResolvedValue([]),
      onPasswordManagerLock: () => () => {},
    });
    const page = (token: number) => (
      <Theme>
        <AISidebar
          developerRequest={source === 'shortcut' ? token : 0}
          menuPaneRequest={
            source === 'menu' ? { pane: 'developer', token } : undefined
          }
        />
      </Theme>
    );
    const view = render(page(1));
    expect(
      await screen.findByRole('region', { name: 'Developer' })
    ).toBeVisible();
    const switchPage = (pane: string) =>
      act(() => {
        localStorage.setItem(
          'kudiumbrowser-ai-page-pane',
          JSON.stringify(pane)
        );
        window.dispatchEvent(
          new CustomEvent('ai-page-preference-changed', {
            detail: 'kudiumbrowser-ai-page-pane',
          })
        );
      });
    switchPage('assistant');
    expect(screen.getByRole('region', { name: 'Assistant' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Saved AI tasks' }));
    expect(screen.getByRole('region', { name: 'Tasks' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Assistant' }));
    expect(screen.getByRole('region', { name: 'Assistant' })).toBeVisible();
    switchPage('notes');
    view.rerender(page(1));
    expect(
      screen.getByRole('region', { name: 'Notes workspace' })
    ).toBeVisible();
    view.rerender(page(2));
    expect(screen.getByRole('region', { name: 'Developer' })).toBeVisible();
    switchPage('assistant');
    expect(screen.getByRole('region', { name: 'Assistant' })).toBeVisible();
    view.unmount();
    localStorage.removeItem('kudiumbrowser-ai-page-pane');
  }
);

it('opens Notes without a tab header and preserves it across page requests', async () => {
  localStorage.removeItem('kudiumbrowser-ai-page-pane');
  mockAI();
  Object.assign(window.electron, {
    passwordManager: jest.fn().mockResolvedValue([]),
    onPasswordManagerLock: () => () => {},
  });
  const page = (pane: 'notes' | 'assistant', token: number) => (
    <Theme>
      <AISidebar menuPaneRequest={{ pane, token }} />
    </Theme>
  );
  const view = render(page('notes', 1));
  const panel = await screen.findByRole('region', { name: 'Notes workspace' });
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(view.container.querySelector('.ai-sidebar-header')).toBeNull();
  expect(panel).toContainElement(
    screen.getByRole('button', { name: 'Create note' })
  );
  view.rerender(page('assistant', 2));
  expect(panel).not.toBeVisible();
  expect(screen.getByRole('button', { name: 'Saved AI tasks' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'AI settings' })).toBeVisible();
  view.rerender(page('notes', 3));
  expect(screen.getByRole('region', { name: 'Notes workspace' })).toBe(panel);
  view.unmount();
  localStorage.removeItem('kudiumbrowser-ai-page-pane');
});

it('shows Activity only on its dedicated page and never restores the tab row', async () => {
  localStorage.removeItem('kudiumbrowser-ai-page-pane');
  const mock = mockAI();
  Object.assign(mock.ai, {
    tasks: jest.fn().mockResolvedValue([]),
    onTasks: () => () => {},
  });
  Object.assign(window.electron, {
    ipcRenderer: { on: () => () => {}, sendMessage: () => {} },
    passwordManager: jest.fn().mockResolvedValue([]),
    onPasswordManagerLock: () => () => {},
    activity: jest.fn().mockResolvedValue([]),
    onActivityChanged: () => () => {},
  });
  // Include the production display rules: display:flex must not override hidden.
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '../renderer/index.css'),
    'utf8'
  );
  const style = document.createElement('style');
  style.textContent = css
    .match(/\.ai-sidebar-pane(?:\[hidden\])? \{[^}]*\}/g)
    .join('\n');
  document.head.appendChild(style);
  type Pane = 'assistant' | 'tasks' | 'notes' | 'developer' | 'activity';
  const page = (pane: Pane, token: number) => (
    <Theme>
      <AISidebar menuPaneRequest={{ pane, token }} />
    </Theme>
  );
  const view = render(page('activity', 1));
  try {
    expect(
      await screen.findByRole('region', { name: 'Activity' })
    ).toBeVisible();
    expect(screen.queryByRole('tablist')).toBeNull();
    for (const [index, pane] of (
      ['assistant', 'tasks', 'notes', 'developer'] as const
    ).entries()) {
      view.rerender(page(pane, index + 2));
      await waitFor(() =>
        expect(
          view.container.querySelector('#ai-activity-panel')
        ).not.toBeVisible()
      );
      expect(screen.queryByRole('tablist')).toBeNull();
    }
    view.rerender(page('activity', 6));
    expect(
      await screen.findByRole('region', { name: 'Activity' })
    ).toBeVisible();
  } finally {
    view.unmount();
    style.remove();
    localStorage.removeItem('kudiumbrowser-ai-page-pane');
  }
});

it('can continue repeatedly after runtime budget pauses without resubmitting the task', async () => {
  const mock = mockAI();
  render(<AISidebar />);
  await screen.findByText('test');
  for (let segment = 0; segment < 2; segment += 1) {
    act(() => {
      mock.event({
        type: 'handoff',
        text: 'Task paused before completion. Progress saved.',
        resumable: true,
      });
      mock.event({ type: 'done', text: '', resumable: true });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue task' }));
    await waitFor(() =>
      expect(mock.ai.resume).toHaveBeenCalledTimes(segment + 1)
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Continue task' })
      ).not.toBeInTheDocument()
    );
  }
  act(() => mock.event({ type: 'done', text: '', resumable: false }));
  expect(mock.ai.run).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Send AI task' })
  ).toBeInTheDocument();
});

it('sends follow-ups to the queue while running and leaves Stop available', async () => {
  const mock = mockAI(Promise.resolve({ busy: true, resumable: false }));
  mock.ai.run.mockResolvedValue(false);
  render(
    <Theme>
      <AISidebar />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Queue message' });
  const input = screen.getByRole('textbox', { name: 'Task for AI' });
  expect(screen.getByRole('button', { name: 'Stop AI task' }).querySelector('svg.lucide-x')).not.toBeNull();
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { value: 'Then check the links' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(mock.ai.run).toHaveBeenCalledWith('Then check the links')
  );
  await waitFor(() => expect(input).toHaveValue(''));
  expect(
    screen.getByRole('button', { name: 'Stop AI task' })
  ).toBeInTheDocument();
  act(() =>
    mock.queueEvent({
      messages: [{ id: 'queued', prompt: 'Then check the links' }],
      paused: false,
    })
  );
  expect(screen.getByText('Then check the links')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove queued message: Then check the links',
    })
  );
  await waitFor(() =>
    expect(mock.ai.queue).toHaveBeenCalledWith({
      action: 'remove',
      id: 'queued',
    })
  );
});

it('restores pending messages and announces them in the chat when they start', async () => {
  const mock = mockAI();
  mock.ai.queue.mockResolvedValue({
    messages: [{ id: 'queued', prompt: 'Follow up' }],
    paused: true,
  });
  render(
    <Theme>
      <AISidebar />
    </Theme>
  );
  await screen.findByText('Queue paused · 1');
  fireEvent.click(screen.getByRole('button', { name: 'Send queued messages' }));
  await waitFor(() =>
    expect(mock.ai.queue).toHaveBeenCalledWith({ action: 'resume' })
  );
  act(() =>
    mock.queueEvent({
      messages: [],
      paused: false,
      started: { type: 'user', text: 'Follow up' },
    })
  );
  expect(screen.queryByText('Queue paused · 1')).toBeNull();
  expect(screen.getByText('Follow up')).toBeInTheDocument();
});

it('avoids duplicate queued sends and preserves a newer draft during submission', async () => {
  const mock = mockAI(Promise.resolve({ busy: true, resumable: false }));
  let accept: (value: boolean) => void = () => {};
  mock.ai.run.mockReturnValue(
    new Promise((resolve) => {
      accept = resolve;
    })
  );
  render(
    <Theme>
      <AISidebar />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Queue message' });
  const input = screen.getByRole('textbox', { name: 'Task for AI' });
  fireEvent.change(input, { target: { value: 'First follow-up' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(mock.ai.run).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: 'Next draft' } });
  await act(async () => accept(false));
  expect(input).toHaveValue('Next draft');
});


it('filters popup Notes requests by group and reapplies the filter on repeated requests', async () => {
  localStorage.removeItem('kudiumbrowser-ai-page-pane');
  mockAI();
  Object.assign(window.electron, {
    passwordManager: jest.fn().mockResolvedValue([
      { id: 'work-note', title: 'Work plan', kind: 'note', scope: 'group:work' },
      { id: 'other-note', title: 'Other plan', kind: 'note', scope: 'group:other' },
    ]),
    onPasswordManagerLock: () => () => {},
  });
  const page = (pane: 'notes' | 'assistant', token: number, notesScope?: string) => (
    <Theme>
      <AISidebar menuPaneRequest={{ pane, token, notesScope }} />
    </Theme>
  );
  const view = render(page('notes', 1, 'group:work'));
  expect(await screen.findByRole('button', { name: 'Work plan' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Other plan' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Filter notes by group' }));
  fireEvent.click(await screen.findByRole('option', { name: 'All notes' }));
  expect(await screen.findByRole('button', { name: 'Other plan' })).toBeVisible();
  view.rerender(page('notes', 2, 'group:work'));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Other plan' })).toBeNull());
  view.rerender(page('assistant', 3));
  view.rerender(page('notes', 4));
  expect(screen.getByRole('button', { name: 'Work plan' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Other plan' })).toBeNull();
  view.rerender(page('notes', 5, 'group:other'));
  expect(await screen.findByRole('button', { name: 'Other plan' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Work plan' })).toBeNull();
  view.unmount();
  localStorage.removeItem('kudiumbrowser-ai-page-pane');
});


it('opens the chat from a popup group request and focuses its scoped composer', async () => {
  localStorage.setItem('kudiumbrowser-ai-page-pane', JSON.stringify('notes'));
  const { ai } = mockAI();
  let groupId: string | null = null;
  ai.groups.mockImplementation((next?: string | null) => {
    if (next !== undefined) groupId = next;
    return Promise.resolve({
      groupId,
      groups: [
        { id: 'work', name: 'Work', slug: 'work', tabs: [] },
        { id: 'home', name: 'Home', slug: 'home', tabs: [] },
      ],
    });
  });
  Object.assign(window.electron, {
    passwordManager: jest.fn().mockResolvedValue([]),
    onPasswordManagerLock: () => () => {},
  });
  const view = render(<Theme><AISidebar /></Theme>);
  expect(await screen.findByRole('region', { name: 'Notes workspace' })).toBeVisible();
  const page = (id: string, token: number) => (
    <Theme>
      <AISidebar contextRequest={{ reference: { kind: 'group', id }, mode: 'scope', token }} />
    </Theme>
  );
  view.rerender(page('work', 1));
  await waitFor(() => expect(ai.groups).toHaveBeenCalledWith('work'));
  expect(await screen.findByRole('region', { name: 'Assistant' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'AI scope' })).toHaveTextContent('Work');
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Task for AI' })).toHaveFocus());
  view.rerender(page('home', 2));
  await waitFor(() => expect(ai.groups).toHaveBeenCalledWith('home'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'AI scope' })).toHaveTextContent('Home')
  );
  expect(ai.run).not.toHaveBeenCalled();
  view.unmount();
  localStorage.removeItem('kudiumbrowser-ai-page-pane');
});
