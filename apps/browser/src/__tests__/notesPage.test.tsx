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
import { browser } from '../browser/client';
import type { VaultItem } from '../browser/passwordManager';

jest.mock('../browser/client', () => ({
  browser: { nativeMenu: jest.fn(async () => undefined) },
}));

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
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
    }),
  });
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
  await screen.findByRole('button', { name: 'Plan' });
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
  expect(editor.querySelector('pre .hljs-keyword')).toHaveTextContent('const');
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
  expect(editor.querySelector('strong')).toHaveTextContent('Heading');
  fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
  expect(editor.querySelector('strong')).toBeNull();
  expect(editor.querySelector('pre code')).toHaveTextContent(
    'const ready = true;'
  );
});

test('formats selected note text through the native context menu and preserves undo', async () => {
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
  const body = await screen.findByRole('textbox', { name: 'Note content' });
  fireEvent.keyDown(body, { key: 'a', ctrlKey: true });
  (browser.nativeMenu as jest.Mock).mockResolvedValueOnce('bold');
  fireEvent.contextMenu(body);
  await waitFor(() =>
    expect(body.querySelector('strong')).toHaveTextContent('Hello')
  );
  expect(browser.nativeMenu).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Copy', role: 'copy', enabled: true }),
      expect.objectContaining({
        label: 'Format',
        submenu: expect.arrayContaining([
          expect.objectContaining({
            id: 'bold',
            checked: false,
            enabled: true,
          }),
          expect.objectContaining({ label: 'Underline' }),
          expect.objectContaining({ label: 'Remove Formatting' }),
        ]),
      }),
    ])
  );
  (browser.nativeMenu as jest.Mock).mockResolvedValueOnce('undo');
  fireEvent.keyDown(body, { key: 'F10', shiftKey: true });
  await waitFor(() => expect(body.querySelector('strong')).toBeNull());
});

const renderNotes = () =>
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
const openPlan = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
  return screen.findByRole('textbox', { name: 'Note content' });
};
const changeView = async (view: 'Visual' | 'Markdown') => {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Change note view' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(await screen.findByRole('menuitemradio', { name: view }));
};
const twoNotes = () =>
  request.mockImplementation(async (input) => {
    if (input.action === 'notes')
      return [note, { ...note, id: 'second', title: 'Other' }];
    if (input.action === 'edit') return note;
    return {};
  });

test('edits and autosaves Markdown source then returns to visual editing', async () => {
  renderNotes();
  await openPlan();
  await changeView('Markdown');
  const source = screen.getByRole('textbox', { name: 'Note Markdown source' });
  expect(source).toHaveValue('Hello');
  fireEvent.change(source, { target: { value: '# Heading\n\n**Bold**' } });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({ notes: '# Heading\n\n**Bold**' }),
      })
    )
  );
  await changeView('Visual');
  const visual = await screen.findByRole('textbox', { name: 'Note content' });
  expect(visual.querySelector('h1')).toHaveTextContent('Heading');
  expect(visual.querySelector('strong')).toHaveTextContent('Bold');
});

test('opens the landing list without a duplicate history header or reading contents', async () => {
  renderNotes();
  await screen.findByRole('button', { name: 'Plan' });
  expect(request.mock.calls.some(([input]) => input.action === 'edit')).toBe(
    false
  );
  expect(
    screen.queryByRole('button', { name: 'Close note history' })
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
  expect(
    screen.queryByText('Your notes, all in one place')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
  expect(
    await screen.findByRole('textbox', { name: 'Note title' })
  ).toHaveValue('Plan');
});

test('shows Create note when no notes exist in the current scope', async () => {
  render(
    <Theme>
      <NotesPage initialScope="other-group" />
    </Theme>
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({ action: 'notes' })
  );
  expect(
    screen.queryByRole('button', { name: 'Plan' })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Create note' })
  ).toBeInTheDocument();
});

test('keeps the explicitly pinned list visible when selecting and editing a note', async () => {
  renderNotes();
  await openPlan();
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Pin note history' })
  );
  await openPlan();
  expect(
    screen.getByRole('button', { name: 'Unpin note history' })
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Note title' }));
  expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('renames from the list while preserving contents', async () => {
  renderNotes();
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Plan' }), {
    key: 'F2',
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Note name' }), {
    target: { value: 'New plan' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save note name' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({ title: 'New plan', notes: 'Hello' }),
      })
    )
  );
});

test('deletes another row without opening it or clearing the active draft', async () => {
  twoNotes();
  renderNotes();
  await openPlan();
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete Other' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Other');
  fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'delete',
      id: 'second',
      scope: undefined,
    })
  );
  expect(request).not.toHaveBeenCalledWith(
    expect.objectContaining({ action: 'edit', id: 'second' })
  );
  expect(screen.getByRole('textbox', { name: 'Note title' })).toHaveValue(
    'Plan'
  );
});

test('retains keyboard reorder after reopening', async () => {
  localStorage.removeItem('kudiumbrowser-ai-page-noteOrder');
  twoNotes();
  const view = renderNotes();
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Other' }), {
    key: 'ArrowUp',
    altKey: true,
  });
  expect(
    JSON.parse(
      localStorage.getItem('kudiumbrowser-ai-page-noteOrder') || 'null'
    )
  ).toEqual(['second', 'n']);
  view.unmount();
  renderNotes();
  await screen.findByRole('button', { name: 'Other' });
  expect(
    document.querySelector('.notes-history-row > button')
  ).toHaveTextContent('Other');
  localStorage.removeItem('kudiumbrowser-ai-page-noteOrder');
});

test('offers native row context actions and starts renaming the correct note', async () => {
  (browser.nativeMenu as jest.Mock).mockResolvedValueOnce('1');
  renderNotes();
  fireEvent.contextMenu(await screen.findByRole('button', { name: 'Plan' }));
  await screen.findByRole('textbox', { name: 'Note name' });
  expect(browser.nativeMenu).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Rename note' }),
      expect.objectContaining({ label: 'Move up', enabled: false }),
      expect.objectContaining({ label: 'Delete note' }),
    ])
  );
});

test('reorders by drag and disables drag during search', async () => {
  localStorage.removeItem('kudiumbrowser-ai-page-noteOrder');
  twoNotes();
  renderNotes();
  const other = (await screen.findByRole('button', { name: 'Other' })).closest(
    '.notes-history-row'
  )!;
  const plan = screen
    .getByRole('button', { name: 'Plan' })
    .closest('.notes-history-row')!;
  const dataTransfer = {
    setData: jest.fn(),
    effectAllowed: '',
    dropEffect: '',
  };
  fireEvent.dragStart(other, { dataTransfer });
  fireEvent.dragOver(plan, { dataTransfer });
  fireEvent.drop(plan, { dataTransfer, clientY: 0 });
  expect(
    JSON.parse(
      localStorage.getItem('kudiumbrowser-ai-page-noteOrder') || 'null'
    )
  ).toEqual(['second', 'n']);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search note titles' }),
    { target: { value: 'Other' } }
  );
  expect(
    screen.getByRole('button', { name: 'Other' }).closest('.notes-history-row')
  ).toHaveAttribute('draggable', 'false');
  localStorage.removeItem('kudiumbrowser-ai-page-noteOrder');
});

test('moves between title and visual body without edits or intercepting composition', async () => {
  renderNotes();
  const body = await openPlan();
  const title = screen.getByRole('textbox', {
    name: 'Note title',
  }) as HTMLInputElement;
  title.focus();
  fireEvent.keyDown(title, { key: 'Enter', isComposing: true });
  expect(title).toHaveFocus();
  fireEvent.keyDown(title, { key: 'Enter' });
  await waitFor(() => expect(body).toHaveFocus());
  fireEvent.keyDown(body, { key: 'ArrowUp' });
  expect(title).toHaveFocus();
  expect(title.selectionStart).toBe(title.value.length);
  fireEvent.keyDown(title, { key: 'ArrowDown' });
  await waitFor(() => expect(body).toHaveFocus());
  expect(request.mock.calls.some(([input]) => input.action === 'save')).toBe(
    false
  );
});

test('moves between title and Markdown source while preserving source Enter', async () => {
  renderNotes();
  await openPlan();
  await changeView('Markdown');
  const title = screen.getByRole('textbox', { name: 'Note title' });
  const source = screen.getByRole('textbox', {
    name: 'Note Markdown source',
  }) as HTMLTextAreaElement;
  title.focus();
  fireEvent.keyDown(title, { key: 'Enter' });
  expect(source).toHaveFocus();
  expect(source.selectionStart).toBe(0);
  fireEvent.keyDown(source, { key: 'ArrowUp' });
  expect(title).toHaveFocus();
  source.focus();
  source.setSelectionRange(3, 3);
  fireEvent.keyDown(source, { key: 'ArrowUp' });
  expect(source).toHaveFocus();
  expect(fireEvent.keyDown(source, { key: 'Enter' })).toBe(true);
});

it('shows unread notes and marks the linked note read when opened', async () => {
  request.mockImplementation(async (input) => {
    if (input.action === 'notes')
      return [{ ...note, asRead: false, fieldCount: 0 }];
    if (input.action === 'edit') return { ...note, asRead: false };
    return {};
  });
  render(
    <Theme>
      <NotesPage />
    </Theme>
  );
  expect(await screen.findByLabelText('Unread note')).toBeInTheDocument();
  act(() => {
    window.dispatchEvent(
      new CustomEvent('kudiumbrowser-open-note', { detail: note.id })
    );
  });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({ id: note.id, asRead: true }),
      })
    )
  );
});

test('history starts unpinned, closes on selection and dismisses on outside click', async () => {
  renderNotes();
  await openPlan();
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  expect(
    await screen.findByRole('button', { name: 'Pin note history' })
  ).toHaveAttribute('aria-pressed', 'false');
  await openPlan();
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Close note history' })
    ).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Note title' }));
  expect(
    screen.queryByRole('button', { name: 'Close note history' })
  ).not.toBeInTheDocument();
});

test('creates new notes in the currently selected group', async () => {
  const view = render(
    <Theme>
      <NotesPage initialScope="first-group" />
    </Theme>
  );
  view.rerender(
    <Theme>
      <NotesPage initialScope="selected-group" />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New note' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        scope: 'selected-group',
        item: expect.objectContaining({
          kind: 'note',
          scope: 'selected-group',
        }),
      })
    )
  );
});

test('reveals the selected note on a narrow panel without clearing its pin preference', async () => {
  renderNotes();
  await openPlan();
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Pin note history' })
  );
  const page = screen.getByRole('region', { name: 'Notes' });
  jest
    .spyOn(page, 'getBoundingClientRect')
    .mockReturnValue({ width: 400 } as DOMRect);
  await openPlan();
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Unpin note history' })
    ).toBeNull()
  );
  expect(screen.getByRole('textbox', { name: 'Note title' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Note history' }));
  expect(
    await screen.findByRole('button', { name: 'Unpin note history' })
  ).toHaveAttribute('aria-pressed', 'true');
});
