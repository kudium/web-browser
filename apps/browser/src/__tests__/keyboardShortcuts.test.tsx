import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { KeyboardShortcuts } from '../components/View/Settings/KeyboardShortcuts';
import { defaultShortcuts, exportShortcuts } from '../browser/shortcuts';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: { preferenceAction: jest.fn().mockResolvedValue(null) },
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe() {},
    unobserve() {},
    disconnect() {},
  })),
});
it('lists both sidebar toggles in preferences', () => {
  render(
    <Theme>
      <KeyboardShortcuts
        bindings={defaultShortcuts}
        busy={false}
        save={jest.fn()}
      />
    </Theme>
  );
  expect(
    screen.getByLabelText('Change Toggle Space sidebar shortcut')
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText('Change Toggle AI assistant shortcut')
  ).toBeInTheDocument();
  expect(screen.getByText('Ctrl + S')).toBeInTheDocument();
  expect(screen.getByText('Ctrl + I')).toBeInTheDocument();
});
it('captures without firing menu accelerators, rejects conflicts, saves and restores menus', async () => {
  const save = jest.fn().mockResolvedValue(true);
  render(
    <Theme>
      <KeyboardShortcuts bindings={defaultShortcuts} busy={false} save={save} />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Search keyboard shortcuts'), {
    target: { value: 'Go back' },
  });
  expect(screen.queryByText('Print page')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Change Go back shortcut'));
  await waitFor(() =>
    expect(browser.preferenceAction).toHaveBeenCalledWith(
      'shortcut-capture-start'
    )
  );
  fireEvent.keyDown(screen.getByLabelText('New shortcut'), {
    key: 'r',
    code: 'KeyR',
    ctrlKey: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'already assigned'
  );
  expect(save).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText('New shortcut'), {
    key: 'b',
    code: 'KeyB',
    altKey: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      ...defaultShortcuts,
      back: ['Alt+KeyB'],
    })
  );
  await waitFor(() =>
    expect(browser.preferenceAction).toHaveBeenCalledWith(
      'shortcut-capture-end'
    )
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('adds an alternate, removes one binding without erasing others, and limits an action to four', async () => {
  const save = jest.fn().mockResolvedValue(true);
  const view = (bindings: typeof defaultShortcuts) => (
    <Theme>
      <KeyboardShortcuts bindings={bindings} busy={false} save={save} />
    </Theme>
  );
  const { rerender } = render(view(defaultShortcuts));
  fireEvent.change(screen.getByLabelText('Search keyboard shortcuts'), {
    target: { value: 'Go back' },
  });
  fireEvent.click(screen.getByLabelText('Add Go back alternate shortcut'));
  expect(
    screen.queryByRole('button', { name: 'Unassign' })
  ).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText('New shortcut'), {
    key: '[',
    code: 'BracketLeft',
    ctrlKey: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'already assigned'
  );
  fireEvent.keyDown(screen.getByLabelText('New shortcut'), {
    key: 'b',
    code: 'KeyB',
    altKey: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const added = {
    ...defaultShortcuts,
    back: [...defaultShortcuts.back, 'Alt+KeyB'],
  };
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(added));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
  rerender(view(added));
  fireEvent.click(
    screen.getAllByRole('button', { name: /^Remove Go back shortcut/ })[0]
  );
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith({
      ...added,
      back: added.back.slice(1),
    })
  );
  rerender(view({ ...added, back: [...added.back, 'Alt+KeyC'] }));
  expect(
    screen.getByLabelText('Add Go back alternate shortcut')
  ).toBeDisabled();
});

it('reviews imported changes, preserves settings on cancellation or failure, and allows retry', async () => {
  const save = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  render(
    <Theme>
      <KeyboardShortcuts bindings={defaultShortcuts} busy={false} save={save} />
    </Theme>
  );
  const next = { ...defaultShortcuts, back: ['Alt+KeyB'], forward: [] };
  const choose = (source: string) =>
    fireEvent.change(screen.getByLabelText('Import shortcut file'), {
      target: {
        files: [{ size: source.length, text: () => Promise.resolve(source) }],
      },
    });
  choose('{');
  expect(await screen.findByRole('alert')).toHaveTextContent('valid');
  expect(save).not.toHaveBeenCalled();
  choose(exportShortcuts(next));
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    '2 actions will change'
  );
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  choose(exportShortcuts(next));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Replace shortcuts' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be saved'
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Replace shortcuts' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
  expect(save).toHaveBeenLastCalledWith(next);
});

it('exports a downloadable snapshot and releases its object URL', () => {
  const create = jest.fn().mockReturnValue('blob:shortcuts');
  const revoke = jest.fn();
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  jest.useFakeTimers();
  try {
    render(
      <Theme>
        <KeyboardShortcuts
          bindings={defaultShortcuts}
          busy={false}
          save={jest.fn()}
        />
      </Theme>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export shortcuts' }));
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(revoke).toHaveBeenCalledWith('blob:shortcuts');
  } finally {
    jest.useRealTimers();
    click.mockRestore();
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});
