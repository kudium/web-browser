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

beforeEach(() => {
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
  let externalListener: (externalStatus: MCPStatus) => void = () => {};
  const ai = {
    taskStatus: jest.fn().mockReturnValue(status),
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
    run: jest.fn(),
  };
  Object.assign(window, { electron: { ai } });
  return {
    ai,
    event: (event: AIEvent) => listener(event),
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue task' }));
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Attach images or files' })
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
        types: ['application/x-touchbox-ai-context'],
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
      types: ['application/x-touchbox-ai-context'],
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
    localStorage.setItem('touchbox-ai-page-historyOpen', 'false');
    localStorage.setItem(
      'touchbox-ai-page-historyPinned',
      JSON.stringify(pinned)
    );
    localStorage.setItem('touchbox-ai-page-pane', '"assistant"');
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
    localStorage.removeItem('touchbox-ai-page-historyOpen');
    localStorage.removeItem('touchbox-ai-page-historyPinned');
    localStorage.removeItem('touchbox-ai-page-pane');
  }
);
