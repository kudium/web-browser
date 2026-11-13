import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { HooksSettings } from '../components/View/Settings/HooksSettings';
import {
  HOOKS_CHANGED,
  OPEN_HOOK_MARKETPLACE,
} from '../components/UI/HookMarketplaceDialog';

jest.mock('../components/UI/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, label, disabled }: any) => (
    <textarea
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const hook = {
  id: 'one',
  name: 'Reading styles',
  path: '/*',
  enabled: false,
  before: '',
  after: '',
  css: 'body { color: red; }',
  exclusions: [],
};
const initial = {
  global: { enabled: true, hooks: [hook] },
  globalHash: 'original',
  siteHooks: [],
};
let request: jest.Mock;
beforeEach(() => {
  request = jest.fn(async (input) =>
    input.action === 'state'
      ? initial
      : { ...initial, global: input.config, globalHash: 'saved' }
  );
  (window as any).electron = { hookMarketplace: { request } };
});
function open() {
  render(
    <Theme>
      <HooksSettings />
    </Theme>
  );
}
it('lists hooks immediately and persists a toggle with the current hash', async () => {
  open();
  expect(await screen.findByText('Reading styles')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('switch', { name: 'Enable Reading styles' })
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'global-save',
        allGroups: true,
        expectedHash: 'original',
        config: { enabled: true, hooks: [{ ...hook, enabled: true }] },
      })
    )
  );
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'Enable Reading styles' })
    ).toBeChecked()
  );
});
it('opens the native editor for an existing global hook', async () => {
  open();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit Reading styles' })
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'global-editor-open',
      id: '@all-groups',
      allGroups: true,
      hookId: 'one',
    })
  );
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
});
it('opens the native editor to create a global hook', async () => {
  open();
  await screen.findByText('Reading styles');
  fireEvent.click(screen.getByRole('button', { name: 'Create global hook' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'global-editor-open',
      id: '@all-groups',
      allGroups: true,
    })
  );
});
it('opens the shared installer for all groups and refreshes after installation', async () => {
  const launch = jest.fn();
  window.addEventListener(OPEN_HOOK_MARKETPLACE, launch);
  open();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Install hooks' })
  );
  expect(launch).toHaveBeenCalledTimes(1);
  expect(launch.mock.calls[0][0].detail).toEqual({
    mode: 'import',
    allGroups: true,
  });
  window.removeEventListener(OPEN_HOOK_MARKETPLACE, launch);
  request.mockResolvedValueOnce({
    ...initial,
    global: {
      ...initial.global,
      hooks: [hook, { ...hook, id: 'downloaded', name: 'Downloaded hook' }],
    },
  });
  fireEvent(window, new Event(HOOKS_CHANGED));
  expect(await screen.findByText('Downloaded hook')).toBeInTheDocument();
});
it('shows save errors without changing the saved toggle', async () => {
  open();
  await screen.findByText('Reading styles');
  request.mockRejectedValueOnce(
    new Error('Settings changed. Reload and try again.')
  );
  fireEvent.click(
    screen.getByRole('switch', { name: 'Enable Reading styles' })
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Settings changed'
  );
  expect(
    screen.getByRole('switch', { name: 'Enable Reading styles' })
  ).not.toBeChecked();
});

it('refreshes the hooks list when returning from the editor window', async () => {
  open();
  await screen.findByText('Reading styles');
  request.mockResolvedValueOnce({
    ...initial,
    global: {
      ...initial.global,
      hooks: [{ ...hook, name: 'Updated in window' }],
    },
  });
  fireEvent(window, new Event('focus'));
  expect(await screen.findByText('Updated in window')).toBeInTheDocument();
});

it('filters hooks without changing their saved enable state', async () => {
  const other = {
    ...hook,
    id: 'other',
    name: 'Quiet mode',
    path: '/articles/*',
    enabled: true,
  };
  request.mockResolvedValueOnce({
    ...initial,
    global: { enabled: true, hooks: [hook, other] },
  });
  open();
  const search = await screen.findByRole('textbox', {
    name: 'Search global hooks',
  });
  fireEvent.change(search, { target: { value: 'quiet' } });
  expect(screen.getByText('Quiet mode')).toBeInTheDocument();
  expect(screen.queryByText('Reading styles')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Enable global hooks' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'global-save',
        config: { enabled: false, hooks: [hook, other] },
      })
    )
  );
  fireEvent.change(search, { target: { value: 'missing hook' } });
  expect(screen.getByText('No matching hooks')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getByText('Reading styles')).toBeInTheDocument();
  expect(
    screen.getByRole('switch', { name: 'Enable Quiet mode' })
  ).toBeChecked();
});
