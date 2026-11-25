import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import {
  HookMarketplaceDialog,
  OPEN_HOOK_MARKETPLACE,
} from '../components/UI/HookMarketplaceDialog';

jest.mock('../utils/hooks/useAppList', () => ({
  useAppList: () => ({ appList: [] }),
}));
jest.mock('../components/UI/GroupPicker', () => ({
  GroupPicker: ({ options, value, onChange, label, disabled }: any) => <select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>,
}));
const target = {
  id: 'tab',
  name: 'Reader',
  groupName: 'Office',
  groupId: 'office',
  profile: 'one',
  url: 'https://example.com',
};
const preview = {
  receipt: 'receipt',
  source: 'https://example.org/hook',
  verified: true,
  publication: { publisher: { name: 'kudium hq' }, version: 1 },
  package: {
    name: 'Highlight links',
    description: 'Make links easier to spot.',
    testUrl: 'https://example.com',
    license: 'MIT',
    applicability: 'general',
    sites: [],
    path: '/*',
    lifecycle: { before: '', after: '', css: 'a { color: blue; }' },
  },
};
const state = {
  destination: target,
  global: { enabled: true, hooks: [] },
  globalHash: 'hash',
  siteHooks: [],
};
let request: jest.Mock;
let installListener: (url: string) => void;
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/?view=settings');
  request = jest.fn(async (input) => {
    if (input.action === 'destinations') return [target];
    if (input.action === 'preview') return preview;
    if (input.action === 'state') return state;
    if (input.action === 'install')
      return {
        ...state,
        installedHook: {
          id: 'installed-id',
          name: 'Highlight links',
          global: input.global,
        },
      };
    return null;
  });
  (window as any).electron = {
    hookMarketplace: {
      request,
      ready: jest.fn(),
      onInstall: jest.fn((listener) => {
        installListener = listener;
        return () => {};
      }),
    },
  };
});
async function open(allGroups = true) {
  render(
    <Theme>
      <HookMarketplaceDialog />
    </Theme>
  );
  act(() => {
    window.dispatchEvent(
      new CustomEvent(OPEN_HOOK_MARKETPLACE, {
        detail: { url: preview.source, allGroups },
      })
    );
  });
  await screen.findByRole('button', { name: 'Install hook' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Install hook' })).toBeEnabled()
  );
}
it('keeps technical metadata collapsed and confirms installation before opening the exact global hook', async () => {
  await open();
  expect(
    screen.getByText('Details and source code').closest('details')
  ).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Install hook' }));
  expect(
    await screen.findByText('Installed successfully. This hook is enabled.')
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Install hook' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByPlaceholderText('Paste a hook link…')
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Enabled hooks also run/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Hook Editor' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'global-editor-open',
      id: '@all-groups',
      allGroups: true,
      hookId: 'installed-id',
    })
  );
});
it('opens the installed website hook and keeps success visible if opening the editor fails', async () => {
  await open(false);
  fireEvent.click(screen.getByRole('button', { name: 'Install hook' }));
  await screen.findByRole('button', { name: 'Open Hook Editor' });
  request.mockImplementation(async (input) => {
    if (input.action === 'site-editor-open')
      throw new Error('Website no longer available.');
    return state;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open Hook Editor' }));
  expect(
    await screen.findByText('Website no longer available.')
  ).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith({
    action: 'site-editor-open',
    id: 'tab',
    allGroups: false,
    hookId: 'installed-id',
  });
  expect(
    screen.getByText('Installed successfully. This hook is enabled.')
  ).toBeInTheDocument();
});
it('accepts external install links in Preferences and does not show success when installation fails', async () => {
  render(
    <Theme>
      <HookMarketplaceDialog />
    </Theme>
  );
  expect(window.electron.hookMarketplace.ready).toHaveBeenCalled();
  act(() => installListener(preview.source));
  await screen.findByRole('button', { name: 'Install hook' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Install hook' })).toBeEnabled()
  );
  request.mockImplementation(async (input) => {
    if (input.action === 'install') throw new Error('Could not save hook.');
    return state;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Install hook' }));
  expect(await screen.findByText('Could not save hook.')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open Hook Editor' })
  ).not.toBeInTheDocument();
});

it('explains when the destination master switch also needs enabling', async () => {
  await open();
  request.mockImplementation(async input => input.action === 'install'
    ? { ...state, installedHook: { id: 'installed-id', name: 'Highlight links', global: true, scopeEnabled: false } }
    : state);
  fireEvent.click(screen.getByRole('button', { name: 'Install hook' }));
  expect(await screen.findByText(/Hooks are also off for All groups/)).toBeInTheDocument();
});

it('closes the explore dialog and shows a returning deep-link install in the same host', async () => {
  render(<Theme><HookMarketplaceDialog /></Theme>);
  act(() => window.dispatchEvent(new CustomEvent(OPEN_HOOK_MARKETPLACE, { detail: { mode: 'import', allGroups: true } })));
  const explore = await screen.findByRole('button', { name: /Explore the marketplace/ });
  await waitFor(() => expect(explore).toBeEnabled());
  fireEvent.click(explore);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'browse' }));
  act(() => installListener(preview.source));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Install hook' })).toBeEnabled());
});

it('saves global enable switches immediately without a Save click', async () => {
  const hook = { id: 'reader', name: 'Reader', enabled: false, path: '/*', before: '', after: '', css: '', exclusions: [] };
  request.mockImplementation(async input => {
    if (input.action === 'destinations') return [target];
    if (input.action === 'state') return { ...state, global: { enabled: true, hooks: [hook] } };
    if (input.action === 'global-save') return { ...state, global: input.config };
    return null;
  });
  render(<Theme><HookMarketplaceDialog /></Theme>);
  act(() => window.dispatchEvent(new CustomEvent(OPEN_HOOK_MARKETPLACE, { detail: { mode: 'global', allGroups: true } })));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Reader' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'global-save', config: { enabled: true, hooks: [{ ...hook, enabled: true }] } })));
});


it('defaults imports to All groups, remembers a chosen group, and drops unavailable saved groups', async () => {
  render(<Theme><HookMarketplaceDialog /></Theme>);
  const launch = () => act(() => { window.dispatchEvent(new CustomEvent(OPEN_HOOK_MARKETPLACE, { detail: { url: preview.source } })); });
  launch();
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Hook group' })).toHaveValue('@all-groups'));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Hook group' })).toBeEnabled());
  fireEvent.change(screen.getByRole('combobox', { name: 'Hook group' }), { target: { value: 'office' } });
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Hook group' })).toHaveValue('office'));
  launch();
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Hook group' })).toHaveValue('office'));
  localStorage.setItem('kudium-hook-install-group', 'deleted-group');
  launch();
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Hook group' })).toHaveValue('@all-groups'));
});

it('offers a reviewed update to an existing hook instead of requiring another copy', async () => {
  const installed = { id: 'existing', name: preview.package.name, enabled: false, path: '/*', before: '', after: '', css: 'a { color: blue; }', installed: { url: preview.source, packageId: 'listing', contentHash: 'original', package: preview.package } };
  const latest = { ...preview, receipt: 'latest-receipt', publication: { ...preview.publication, id: 'listing', version: 2 }, package: { ...preview.package, lifecycle: { ...preview.package.lifecycle, css: 'a { color: red; }' } } };
  const normalRequest = request.getMockImplementation()!;
  request.mockImplementation(async input => {
    if (input.action === 'state') return { ...state, global: { enabled: true, hooks: [installed] } };
    if (input.action === 'updates') return [{ hookId: 'existing', global: true, modified: true, localHash: 'local-hash', localPackage: preview.package, current: installed.installed, preview: latest }];
    return normalRequest(input);
  });
  render(<Theme><HookMarketplaceDialog /></Theme>);
  act(() => window.dispatchEvent(new CustomEvent(OPEN_HOOK_MARKETPLACE, { detail: { url: preview.source, allGroups: true } })));
  const update = await screen.findByRole('button', { name: 'Update existing hook' });
  await waitFor(() => expect(update).toBeEnabled());
  expect(screen.getByText(/You have local edits/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Install another copy' })).toBeInTheDocument();
  fireEvent.click(update);
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'install', receipt: 'latest-receipt', replaceId: 'existing', expectedHash: 'local-hash', global: true, allGroups: true })));
});

it('offers opt-in Auto mode when installing an All groups hook', async () => {
  render(<Theme><HookMarketplaceDialog /></Theme>);
  act(() => window.dispatchEvent(new CustomEvent(OPEN_HOOK_MARKETPLACE, { detail: { url: preview.source, allGroups: true } })));
  const auto = await screen.findByRole('radio', { name: 'Only where I enable it (Auto)' });
  expect(auto).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'On matching websites' })).toBeChecked();
  fireEvent.click(auto);
  expect(auto).toBeChecked();
  expect(screen.getByRole('radio', { name: 'On matching websites' })).not.toBeChecked();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Install hook' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Install hook' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'install', global: true, allGroups: true, autoMode: true })));
});
