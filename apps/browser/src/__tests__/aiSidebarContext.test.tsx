import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AISidebar } from '../components/UI/AISidebar';

beforeEach(() => {
  Object.assign(global, {
    ResizeObserver: class {
      observe = jest.fn();

      unobserve = jest.fn();

      disconnect = jest.fn();
    },
  });
});

it('selects scope and model in the composer and expands scope explicitly for mentions', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: jest.fn(),
  });
  const groups = [
    {
      id: 'work',
      name: 'Work',
      slug: 'work',
      tabs: [
        {
          id: 'github',
          name: 'GitHub',
          slug: 'github',
          url: 'https://github.com',
          icon: '',
        },
      ],
    },
    {
      id: 'home',
      name: 'Home',
      slug: 'home',
      tabs: [
        {
          id: 'mail',
          name: 'Mail',
          slug: 'mail',
          url: 'https://mail.test',
          icon: '',
        },
      ],
    },
  ];
  let scope: string | null = null;
  const settings = {
    endpoint: 'https://api.test/v1',
    model: 'cheap',
    hasKey: true,
    remembered: true,
  };
  const ai = {
    skills: jest.fn().mockResolvedValue([
      {
        id: 'reply',
        name: 'Reply',
        description: 'Write a reply',
        instructions: 'Reply clearly',
        enabled: true,
        resources: {},
      },
      {
        id: 'disabled',
        name: 'Hidden',
        description: '',
        instructions: 'Hidden',
        enabled: false,
        resources: {},
      },
    ]),
    settings: jest
      .fn()
      .mockImplementation((patch) =>
        Promise.resolve({ ...settings, ...patch })
      ),
    permissions: jest
      .fn()
      .mockImplementation((mode = 'standard') =>
        Promise.resolve({ mode, effectiveMode: mode, taskOnly: false })
      ),
    onPermissions: () => () => {},
    models: jest.fn().mockResolvedValue(['cheap', 'fast']),
    groups: jest.fn().mockImplementation((next) => {
      if (next !== undefined) scope = next;
      return Promise.resolve({ groupId: scope, groups });
    }),
    onScope: () => () => {},
    onEvent: () => () => {},
    onMCP: () => () => {},
    onSettings: () => () => {},
    mcpStatus: jest.fn().mockResolvedValue({ running: false }),
    taskStatus: jest.fn().mockResolvedValue({ busy: false, resumable: false }),
    run: jest.fn().mockResolvedValue(true),
    attachContext: jest.fn().mockResolvedValue({
      kind: 'tab',
      id: 'mail',
      groupId: 'home',
      name: 'Mail',
      icon: '',
      tabCount: 1,
    }),
  };
  const projectFiles = jest.fn().mockResolvedValue({
    entries: [{ kind: 'file', name: 'home.html', path: 'src/home.html' }],
  });
  Object.assign(window, {
    electron: { ai, siteDeveloper: { files: projectFiles } },
  });
  const { rerender } = render(<AISidebar />);
  await screen.findByRole('button', { name: 'AI model' });
  rerender(
    <AISidebar
      contextRequest={{
        reference: { kind: 'group', id: 'home' },
        token: 1,
        mode: 'scope',
      }}
    />
  );
  await waitFor(() => expect(ai.groups).toHaveBeenCalledWith('home'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'AI scope' })).toHaveTextContent(
      'Home'
    )
  );
  expect(ai.attachContext).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Task for AI' })).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'AI permissions' }));
  fireEvent.click(await screen.findByRole('option', { name: /Full access/ }));
  await waitFor(() => expect(ai.permissions).toHaveBeenCalledWith('full'));
  fireEvent.click(screen.getByRole('button', { name: 'AI scope' }));
  fireEvent.click(await screen.findByRole('option', { name: /Work/ }));
  await waitFor(() => expect(ai.groups).toHaveBeenCalledWith('work'));
  fireEvent.click(screen.getByRole('button', { name: 'AI model' }));
  fireEvent.click(await screen.findByRole('option', { name: 'fast' }));
  await waitFor(() =>
    expect(ai.settings).toHaveBeenCalledWith({
      endpoint: settings.endpoint,
      model: 'fast',
      remember: true,
    })
  );
  const input = screen.getByRole('textbox', { name: 'Task for AI' });
  fireEvent.change(input, { target: { value: '/', selectionStart: 1 } });
  expect(await screen.findByRole('option', { name: /Reply/ })).toBeVisible();
  expect(
    screen.queryByRole('option', { name: /Hidden/ })
  ).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('/Reply ');
  fireEvent.change(input, { target: { value: '/home', selectionStart: 5 } });
  fireEvent.click(
    await screen.findByRole('option', { name: /src\/home.html/ })
  );
  expect(input).toHaveValue('project file "src/home.html" in @work ');
  expect(
    projectFiles.mock.calls.every(([, request]) => request.action === 'list')
  ).toBe(true);
  expect(ai.run).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '/', selectionStart: 1 } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(
    screen.queryByRole('listbox', { name: 'Skills and project files' })
  ).not.toBeInTheDocument();
  fireEvent.change(input, {
    target: { value: 'Read @home/m', selectionStart: 12 },
  });
  fireEvent.click(await screen.findByRole('option', { name: /Mail/ }));
  expect(input).toHaveValue('Read @home/mail ');
  expect(screen.getByRole('button', { name: 'Send AI task' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Use All groups' }));
  await waitFor(() => expect(ai.groups).toHaveBeenCalledWith(null));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send AI task' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Send AI task' }));
  await waitFor(() =>
    expect(ai.run).toHaveBeenCalledWith({
      prompt: 'Read @home/mail',
      attachmentIds: [],
      contextReferences: [{ kind: 'tab', id: 'mail' }],
    })
  );
  fireEvent.change(input, {
    target: { value: 'My existing draft', selectionStart: 17 },
  });
  rerender(
    <AISidebar
      promptRequest={{ text: 'Selected website text', append: true, token: 1 }}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Task for AI' })).toHaveValue(
      'My existing draft\n\nSelected website text'
    )
  );
  expect(ai.run).toHaveBeenCalledTimes(1);
});

it('offers thinking controls for Ollama and saves the selected setting', async () => {
  const settings = {
    endpoint: 'http://localhost:11434/v1',
    model: 'qwen3:8b',
    hasKey: false,
    remembered: false,
  };
  const ai = {
    settings: jest
      .fn()
      .mockImplementation((patch) =>
        Promise.resolve({ ...settings, ...patch })
      ),
    skills: jest.fn().mockResolvedValue([]),
    models: jest.fn().mockResolvedValue(['qwen3:8b']),
    groups: jest.fn().mockResolvedValue({ groupId: null, groups: [] }),
    permissions: jest.fn().mockResolvedValue({
      mode: 'standard',
      effectiveMode: 'standard',
      taskOnly: false,
    }),
    mcpStatus: jest.fn().mockResolvedValue({ running: false }),
    taskStatus: jest.fn().mockResolvedValue({ busy: false, resumable: false }),
    onEvent: () => () => {},
    onMCP: () => () => {},
    onSettings: () => () => {},
    onScope: () => () => {},
    onPermissions: () => () => {},
  };
  Object.assign(window, { electron: { ai } });
  render(<AISidebar />);
  const control = await screen.findByRole('button', { name: 'AI model' });
  const input = screen.getByRole('textbox', { name: 'Task for AI' });
  fireEvent.change(input, { target: { value: '/', selectionStart: 1 } });
  expect(
    await screen.findByText(/No skills or project files available/)
  ).toBeVisible();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByText(/No skills or project files available/)).toBeNull();

  expect(
    screen.queryByRole('button', { name: 'Thinking level' })
  ).not.toBeInTheDocument();
  fireEvent.click(control);
  const slider = await screen.findByRole('slider', { name: 'Thinking level' });
  fireEvent.keyDown(slider, { key: 'End' });
  await waitFor(() =>
    expect(ai.settings).toHaveBeenLastCalledWith({
      endpoint: settings.endpoint,
      model: settings.model,
      remember: false,
      thinking: 'on',
    })
  );
  expect(
    screen.getByRole('slider', { name: 'Thinking level' })
  ).toHaveAttribute('aria-valuetext', 'On');
  expect(screen.getByRole('button', { name: 'AI model' })).toHaveTextContent(
    'On'
  );
});
