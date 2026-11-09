import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { NotesPage } from '../components/UI/NotesPage';
import type { VaultItem } from '../browser/passwordManager';

jest.mock('../components/UI/AIMessage', () => ({
  renderAIMessage: (text: string) => text,
}));
const note: VaultItem = {
  id: 'n',
  title: 'Plan',
  notes: 'Hello',
  kind: 'note',
  fields: [],
  origin: '',
  username: '',
  password: '',
  allowAI: false,
};
let request: jest.Mock;
let lock: () => void;
beforeEach(() => {
  request = jest.fn(async (input) => {
    if (input.action === 'notes')
      return [{ ...note, notes: undefined, fieldCount: 0 }];
    if (input.action === 'edit') return note;
    return {};
  });
  Object.assign(window, {
    electron: {
      passwordManager: request,
      onPasswordManagerLock: (callback: () => void) => {
        lock = callback;
        return () => {};
      },
    },
  });
  Object.assign(global, {
    ResizeObserver: jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    })),
  });
});
test('loads titles without opening contents, then formats and saves the selected note', async () => {
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
  const editor = (await screen.findByRole('textbox', {
    name: 'Note content',
  })) as HTMLTextAreaElement;
  expect(request).toHaveBeenCalledWith({
    action: 'edit',
    id: 'n',
    scope: undefined,
  });
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
  expect(editor.querySelector('strong')).toHaveTextContent('Hello');
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 850);
    });
  });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({ notes: '**Hello**' }),
      })
    )
  );
});
test('debounces typing instead of persisting each keystroke', async () => {
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
  const editor = await screen.findByRole('textbox', { name: 'Note content' });
  jest.useFakeTimers();
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'i', ctrlKey: true });
  expect(
    request.mock.calls.filter(([input]) => input.action === 'save')
  ).toHaveLength(0);
  await act(async () => {
    jest.advanceTimersByTime(800);
  });
  expect(
    request.mock.calls.filter(([input]) => input.action === 'save')
  ).toHaveLength(1);
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'save',
      item: expect.objectContaining({
        notes: expect.stringContaining('Hello'),
      }),
    })
  );
  jest.useRealTimers();
});

test('keeps ordinary notes open on Personal Data lock and puts locking behind options', async () => {
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
  const editor = await screen.findByRole('textbox', { name: 'Note content' });
  await act(async () => {
    lock();
  });
  expect(editor).toHaveTextContent('Hello');
  expect(screen.queryByText('Lock note')).not.toBeInTheDocument();
  expect(
    request.mock.calls.some(([input]) => input.action === 'authenticate')
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Lock note' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({ sensitive: true }),
      })
    )
  );
  await waitFor(() =>
    expect(screen.queryByText('Lock note')).not.toBeInTheDocument()
  );
  await act(async () => {
    lock();
  });
  expect(
    screen.queryByRole('textbox', { name: 'Note content' })
  ).not.toBeInTheDocument();
});

test('renders Markdown visually and preserves undo after formatting', async () => {
  request.mockImplementation(async (input) => {
    if (input.action === 'notes')
      return [{ ...note, notes: undefined, fieldCount: 0 }];
    if (input.action === 'edit')
      return { ...note, notes: '# Heading\n\n```ts\nconst ready = true;\n```' };
    return {};
  });
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  expect(
    screen.queryByRole('button', { name: 'Note history' })
  ).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
  const editor = await screen.findByRole('textbox', { name: 'Note content' });
  expect(editor.querySelector('h1')).toHaveTextContent('Heading');
  expect(editor.querySelector('pre code')).toHaveTextContent(
    'const ready = true;'
  );
  expect(editor).not.toHaveTextContent('```');
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
  expect(editor.querySelector('strong')).toHaveTextContent('Heading');
  fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
  expect(editor.querySelector('strong')).toBeNull();
  expect(editor.querySelector('pre code')).toHaveTextContent(
    'const ready = true;'
  );
});
