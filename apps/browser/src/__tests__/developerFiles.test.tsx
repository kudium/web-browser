import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeveloperFiles } from '../components/UI/DeveloperFiles';

jest.mock('../components/UI/DeveloperFileEditor', () => ({
  DeveloperFileEditor: ({ name, value, onChange, disabled }: any) => (
    <textarea
      aria-label={`Editor for ${name}`}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
const files = jest.fn();
beforeEach(() => {
  localStorage.clear();
  files.mockReset();
  Object.assign(global, {
    ResizeObserver: class {
      observe = jest.fn();

      disconnect = jest.fn();

      unobserve = jest.fn();
    },
  });
  HTMLElement.prototype.scrollIntoView = jest.fn();
  Object.assign(window, { electron: { siteDeveloper: { files } } });
});
it('navigates folders, previews escaped text and returns to its folder', async () => {
  files.mockResolvedValueOnce({
    path: '',
    entries: [{ name: 'src', path: 'src', kind: 'folder' }],
  });
  render(
    <Theme>
      <DeveloperFiles sourceId="one" projectName="Project" />
    </Theme>
  );
  const folder = await screen.findByRole('button', { name: 'src' });
  files.mockResolvedValueOnce({
    path: 'src',
    entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }],
  });
  fireEvent.click(folder);
  const file = await screen.findByRole('button', { name: 'app.ts' });
  files.mockResolvedValueOnce({
    path: 'src/app.ts',
    file: {
      name: 'app.ts',
      path: 'src/app.ts',
      size: 10,
      text: '<script>hello</script>',
    },
  });
  fireEvent.click(file);
  expect(
    ((await screen.findByLabelText('Editor for app.ts')) as HTMLTextAreaElement)
      .value
  ).toBe('<script>hello</script>');
  expect(document.querySelector('.developer-file-preview script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back to folder' }));
  expect(screen.getByRole('button', { name: 'app.ts' })).toBeTruthy();
  expect(files).toHaveBeenCalledWith('one', {
    action: 'list',
    path: 'src',
    hidden: false,
  });
});
it('ignores a result after closing and displays actionable failures', async () => {
  files.mockRejectedValueOnce(new Error('Folder unavailable.'));
  const rendered = render(
    <Theme>
      <DeveloperFiles sourceId="one" projectName="Project" />
    </Theme>
  );
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Folder unavailable'
  );
  let finish!: (value: any) => void;
  files.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
  rendered.unmount();
  await act(async () => finish({ path: '', entries: [] }));
});

it('loads an expanded folder once and retries a failed branch without replacing the root', async () => {
  files.mockResolvedValueOnce({
    path: '',
    entries: [{ name: 'src', path: 'src', kind: 'folder' }],
  });
  render(
    <Theme>
      <DeveloperFiles sourceId="one" projectName="Project" />
    </Theme>
  );
  files.mockRejectedValueOnce(new Error('Folder unavailable.'));
  fireEvent.click(await screen.findByRole('button', { name: 'src' }));
  const retry = await screen.findByRole('button', {
    name: 'Could not load. Retry',
  });
  files.mockResolvedValueOnce({
    path: 'src',
    entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }],
  });
  fireEvent.click(retry);
  await screen.findByRole('button', { name: 'app.ts' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.querySelector('.tree-status.selected')).toBeNull();
  expect(screen.getByRole('button', { name: 'Project' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'src' }));
  expect(screen.queryByRole('button', { name: 'app.ts' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'src' }));
  await screen.findByRole('button', { name: 'app.ts' });
  expect(files).toHaveBeenCalledTimes(3);
});

it('supports multiple selection and filters loaded descendants without previewing selected files', async () => {
  files.mockResolvedValueOnce({
    path: '',
    entries: [
      { name: 'src', path: 'src', kind: 'folder' },
      ...Array.from({ length: 9 }, (_, index) => ({
        name: `file-${index}.ts`,
        path: `file-${index}.ts`,
        kind: 'file',
      })),
    ],
  });
  render(
    <Theme>
      <DeveloperFiles sourceId="one" projectName="Project" />
    </Theme>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'file-0.ts' }), {
    ctrlKey: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'file-1.ts' }), {
    ctrlKey: true,
  });
  expect(
    document.querySelectorAll('[role="treeitem"][aria-selected="true"]').length
  ).toBe(2);
  expect(files).toHaveBeenCalledTimes(1);
  files.mockResolvedValueOnce({
    path: 'src',
    entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'src' }));
  await screen.findByRole('button', { name: 'app.ts' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter files' }), {
    target: { value: 'app.ts' },
  });
  expect(screen.getByRole('button', { name: 'app.ts' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'file-0.ts' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter files' }), {
    target: { value: 'absent' },
  });
  expect(screen.getByText('No matching files.')).toBeTruthy();
});

it('discards an unfinished folder load after refresh and fetches fresh children', async () => {
  const rootListing = {
    path: '',
    entries: [{ name: 'src', path: 'src', kind: 'folder' }],
  };
  files.mockResolvedValueOnce(rootListing);
  render(
    <Theme>
      <DeveloperFiles sourceId="one" projectName="Project" />
    </Theme>
  );
  let finish!: (value: any) => void;
  files.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(await screen.findByRole('button', { name: 'src' }));
  await screen.findByRole('button', { name: 'Loading…' });
  files.mockResolvedValueOnce(rootListing);
  files.mockResolvedValueOnce({
    path: 'src',
    entries: [{ name: 'fresh.ts', path: 'src/fresh.ts', kind: 'file' }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));
  await act(async () => {});
  await act(async () =>
    finish({
      path: 'src',
      entries: [{ name: 'stale.ts', path: 'src/stale.ts', kind: 'file' }],
    })
  );
  await screen.findByRole('button', { name: 'fresh.ts' });
  expect(screen.queryByRole('button', { name: 'stale.ts' })).toBeNull();
  expect(files).toHaveBeenCalledTimes(4);
});

it('keeps unsaved edits on save failure, confirms closing and saves the expected version', async () => {
  files.mockResolvedValueOnce({
    path: '',
    entries: [{ name: 'edit.ts', path: 'edit.ts', kind: 'file' }],
  });
  render(
    <Theme>
      <DeveloperFiles sourceId="editable" projectName="Editing" />
    </Theme>
  );
  const original = {
    name: 'edit.ts',
    path: 'edit.ts',
    size: 8,
    text: 'original',
    version: 'a'.repeat(64),
  };
  files.mockResolvedValueOnce({ path: 'edit.ts', file: original });
  fireEvent.click(await screen.findByRole('button', { name: 'edit.ts' }));
  const editor = (await screen.findByLabelText(
    'Editor for edit.ts'
  )) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: 'my edits' } });
  files.mockRejectedValueOnce(Error('This file changed on disk.'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'changed on disk'
  );
  expect(editor.value).toBe('my edits');
  fireEvent.click(screen.getByRole('button', { name: 'Back to folder' }));
  expect(screen.queryByRole('button', { name: 'Close files' })).toBeNull();
  expect(screen.getByText('Save changes to edit.ts?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const updated = { ...original, text: 'my edits', version: 'b'.repeat(64) };
  files.mockResolvedValueOnce({ path: 'edit.ts', file: updated });
  fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
  await screen.findByText('edit.ts · Saved');
  expect(files).toHaveBeenLastCalledWith('editable', {
    action: 'save',
    path: 'edit.ts',
    text: 'my edits',
    version: original.version,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back to folder' }));
  expect(screen.queryByLabelText('Editor for edit.ts')).toBeNull();
});

it('recovers an unsaved draft after changing views and permits explicit discard', async () => {
  const original = {
    name: 'draft.ts',
    path: 'draft.ts',
    size: 8,
    text: 'original',
    version: 'c'.repeat(64),
  };
  files.mockImplementation(async (_source, request) =>
    request.action === 'list'
      ? {
          path: '',
          entries: [{ name: 'draft.ts', path: 'draft.ts', kind: 'file' }],
        }
      : { path: 'draft.ts', file: original }
  );
  const show = () =>
    render(
      <Theme>
        <DeveloperFiles sourceId="draft-recovery" projectName="Drafts" />
      </Theme>
    );
  const first = show();
  fireEvent.click(await screen.findByRole('button', { name: 'draft.ts' }));
  fireEvent.change(await screen.findByLabelText('Editor for draft.ts'), {
    target: { value: 'draft edits' },
  });
  first.unmount();
  show();
  const editor = (await screen.findByLabelText(
    'Editor for draft.ts'
  )) as HTMLTextAreaElement;
  expect(editor.value).toBe('draft edits');
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(editor.value).toBe('original');
});

it('restores expanded folders, selected file and open editor after reopening Files', async () => {
  const original = {
    name: 'app.ts',
    path: 'src/app.ts',
    size: 5,
    text: 'hello',
    version: 'd'.repeat(64),
  };
  files.mockImplementation(async (_source, request) => {
    if (request.action === 'preview')
      return { path: original.path, file: original };
    if (request.path === 'src')
      return {
        path: 'src',
        entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }],
      };
    return {
      path: '',
      entries: [{ name: 'src', path: 'src', kind: 'folder' }],
    };
  });
  const show = () =>
    render(
      <Theme>
        <DeveloperFiles
          sourceId="remember"
          projectName="Remember"
          projectPath="/remember"
        />
      </Theme>
    );
  const first = show();
  fireEvent.click(await screen.findByRole('button', { name: 'src' }));
  const file = await screen.findByRole('button', { name: 'app.ts' });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  fireEvent.click(file);
  await screen.findByLabelText('Editor for app.ts');
  first.unmount();
  show();
  expect(
    ((await screen.findByLabelText('Editor for app.ts')) as HTMLTextAreaElement)
      .value
  ).toBe('hello');
  const restoredFile = await screen.findByRole('button', { name: 'app.ts' });
  await waitFor(() => expect(restoredFile.className).toContain('selected'));
  expect(
    screen
      .getByRole('button', { name: 'src' })
      .querySelector('.tree-chevron')
      ?.getAttribute('class')
  ).toContain('open');
});

it('falls back to the project root when the remembered folder was removed', async () => {
  localStorage.setItem(
    'kudiumbrowser-file-position:removed:/removed',
    JSON.stringify({ folder: 'deleted', expanded: [], selected: [], scroll: 0 })
  );
  files.mockRejectedValueOnce(Error('Folder was removed.'));
  files.mockResolvedValueOnce({
    path: '',
    entries: [{ name: 'current.ts', path: 'current.ts', kind: 'file' }],
  });
  render(
    <Theme>
      <DeveloperFiles
        sourceId="removed"
        projectName="Removed"
        projectPath="/removed"
      />
    </Theme>
  );
  await screen.findByRole('button', { name: 'current.ts' });
  expect(files).toHaveBeenNthCalledWith(1, 'removed', {
    action: 'list',
    path: 'deleted',
    hidden: false,
  });
  expect(files).toHaveBeenNthCalledWith(2, 'removed', {
    action: 'list',
    path: '',
    hidden: false,
  });
});

it('offers contextual file actions, copies the clicked path and creates files from the background menu', async () => {
  const nativeMenu = jest.fn();
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(window.electron, { browser: { nativeMenu } });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  files.mockImplementation(async (_source, request) =>
    request.action === 'list'
      ? {
          path: '',
          entries: [{ name: 'app.ts', path: 'app.ts', kind: 'file' }],
        }
      : request.action === 'create-file'
      ? { path: 'new.ts' }
      : {
          path: 'new.ts',
          file: {
            name: 'new.ts',
            path: 'new.ts',
            text: '',
            size: 0,
            version: 'e'.repeat(64),
          },
        }
  );
  render(
    <Theme>
      <DeveloperFiles
        sourceId="context"
        projectName="Context"
        projectPath="/project"
      />
    </Theme>
  );
  const file = await screen.findByRole('button', { name: 'app.ts' });
  nativeMenu.mockImplementationOnce(
    async (items) =>
      items.find((item: any) => item.label === 'Copy absolute path').id
  );
  fireEvent.contextMenu(file);
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith('/project/app.ts')
  );
  const labels = nativeMenu.mock.calls[0][0].map((item: any) => item.label);
  expect(labels).toEqual(
    expect.arrayContaining([
      'Open in sidebar',
      'Rename…',
      'Duplicate file…',
      'Move to Trash',
      'Open system terminal here',
    ])
  );
  expect(labels).not.toContain('Cut');
  expect(screen.queryByRole('button', { name: 'Close files' })).toBeNull();
  nativeMenu.mockImplementationOnce(
    async (items) => items.find((item: any) => item.label === 'New file…').id
  );
  fireEvent.contextMenu(screen.getByLabelText('Files and folders'));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Item name' }), {
    target: { value: 'new.ts' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'New file' }));
  await screen.findByLabelText('Editor for new.ts');
  expect(files).toHaveBeenCalledWith('context', {
    action: 'create-file',
    path: '',
    name: 'new.ts',
  });
});

it('opens a folder in a new inbuilt terminal tab and reveals the terminal', async () => {
  const onOpenTerminal = jest.fn();
  const nativeMenu = jest.fn(
    async (items) =>
      items.find((item: any) => item.label === 'Open in new terminal tab').id
  );
  Object.assign(window.electron, { browser: { nativeMenu } });
  files.mockImplementation(async (_source, request) =>
    request.action === 'list'
      ? { path: '', entries: [{ name: 'src', path: 'src', kind: 'folder' }] }
      : { path: 'src', terminal: { open: true } }
  );
  render(
    <Theme>
      <DeveloperFiles
        sourceId="folder-terminal"
        projectName="Project"
        onOpenTerminal={onOpenTerminal}
      />
    </Theme>
  );
  fireEvent.contextMenu(await screen.findByRole('button', { name: 'src' }));
  await waitFor(() => expect(onOpenTerminal).toHaveBeenCalledTimes(1));
  expect(files).toHaveBeenCalledWith('folder-terminal', {
    action: 'terminal-tab',
    path: 'src',
  });
});
