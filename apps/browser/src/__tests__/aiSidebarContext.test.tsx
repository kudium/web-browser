import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AISidebar } from '../components/UI/AISidebar';

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
  Object.assign(window, { electron: { ai } });
  render(<AISidebar />);
  await screen.findByRole('button', { name: 'AI model' });
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
});
