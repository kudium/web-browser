import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PasswordManager } from '../components/View/Settings/PasswordManager';
import { defaultPreferences } from '../browser/preferences';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});

const saved = {
  id: 'one',
  title: 'Example',
  origin: 'https://example.com',
  kind: 'login',
  username: 'sam',
  password: 'secret',
  fields: [],
  allowAI: false,
};
const status = {
  initialized: true,
  locked: false,
  authentication: 'os',
  enabled: true,
  autofill: true,
  ai: false,
  items: [{ ...saved, fieldCount: 0 }],
};
let request: jest.Mock;
beforeEach(() => {
  request = jest.fn(async (input) => {
    if (input.action === 'status') return status;
    if (input.action === 'pages') return [];
    if (input.action === 'edit') return saved;
    return null;
  });
  Object.assign(window, {
    electron: {
      passwordManager: request,
      onPasswordManagerLock: () => () => {},
      browser: {
        confirm: jest.fn().mockResolvedValue(true),
        preferences: jest.fn(async (_action, patch) => ({ ...defaultPreferences, ...patch })),
        onPreferences: () => () => {},
      },
    },
  });
});

it('uses compact saved-item actions without the tab-targeted fill workflow', async () => {
  show();
  const list = await screen.findByRole('list', { name: 'Saved Personal Data' });
  expect(within(list).getByRole('button', { name: 'Edit' }).querySelector('svg')).toBeTruthy();
  expect(within(list).getByRole('button', { name: 'Delete' }).querySelector('svg')).toBeTruthy();
  expect(screen.queryByText('Fill into')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Fill' })).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalledWith({ action: 'pages' });
  fireEvent.click(within(list).getByRole('button', { name: 'Example' }));
  await screen.findByRole('dialog', { name: 'Edit saved item' });
});

it('keeps notes out of the saved-data list and avoids repeated browser-wide labels', async () => {
  request.mockImplementation(async (input) => input.action === 'status' ? { ...status, items: [...status.items, { ...status.items[0], id: 'note', kind: 'note', title: 'Meeting note' }] } : []);
  show();
  const list = await screen.findByRole('list', { name: 'Saved Personal Data' });
  expect(within(list).queryByText('Meeting note')).not.toBeInTheDocument();
  expect(screen.queryByText('Browser-wide')).not.toBeInTheDocument();
  expect(screen.getByText('1 item · Unlocked')).toBeInTheDocument();
});

it('keeps global AI access unchanged when toggling autofill', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Autofill and access settings' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Manual autofill' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'settings', enabled: true, autofill: false, ai: false }));
});

it('confirms deletion through the icon action', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'delete', id: 'one' }));
  expect(window.electron.browser.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete “Example”?', confirm: 'Delete' }));
});

it('does not reopen a private editor when the computer locks during loading', async () => {
  let lock = () => {};
  Object.assign(window.electron, { onPasswordManagerLock: (callback: () => void) => { lock = callback; return () => {}; } });
  let complete: (item: typeof saved) => void = () => {};
  request.mockImplementation(async (input) => input.action === 'edit' ? new Promise(resolve => { complete = resolve; }) : status);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  await act(async () => { lock(); complete(saved); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
function show() {
  render(
    <Theme>
      <PasswordManager />
    </Theme>
  );
}

it('opens Add in a modal, focuses Key, and discards the cancelled draft', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  const dialog = screen.getByRole('dialog', { name: 'Add saved item' });
  expect(within(dialog).getByLabelText('Key 1')).toHaveFocus();
  fireEvent.change(within(dialog).getByLabelText('Key 1'), {
    target: { value: 'Draft key' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
  expect(screen.getByLabelText('Key 1')).toHaveValue('');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('opens Edit in the same modal and keeps a failed save visible with the draft intact', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit saved item' });
  expect(within(dialog).getByLabelText('Key 1')).toHaveValue('username');
  request.mockRejectedValueOnce(new Error('save failed'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Couldn’t save'
  );
  expect(within(dialog).getByLabelText('Value 2')).toHaveValue('secret');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
  expect(request).toHaveBeenCalledWith({
    action: 'save',
    item: saved,
  });
});

it('saves a key/value pair without silently granting AI access', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  expect(screen.queryByLabelText('Item type')).not.toBeInTheDocument();
  expect(screen.queryByText('Payment Methods')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Key 1'), {
    target: { value: 'Card number' },
  });
  fireEvent.change(screen.getByLabelText('Value 1'), {
    target: { value: '4111111111111111' },
  });
  expect(screen.getByLabelText('Value 1')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('Website (optional)')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({
          title: 'Card number',
          origin: '',
          allowAI: false,
          fields: [
            { name: 'Card number', value: '4111111111111111', secret: false },
          ],
        }),
      })
    )
  );
});

it('keeps password generation in the shared value options', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  fireEvent.change(screen.getByLabelText('Key 1'), {
    target: { value: 'Password' },
  });
  fireEvent.click(screen.getByText('Value options'));
  fireEvent.click(screen.getByRole('button', { name: 'Generate password' }));
  expect((screen.getByLabelText('Value 1') as HTMLInputElement).value).toMatch(
    /^Aa1![0-9a-f]{36}$/
  );
});

it('persists explicit AI consent from the local editor', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit saved item' });
  const consent = within(dialog).getByRole('switch', {
    name: 'Allow AI to use this item',
  });
  expect(consent).not.toBeChecked();
  fireEvent.click(consent);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'save',
      item: { ...saved, allowAI: true },
    })
  );
});

it('shows initial load failure and lets the user retry', async () => {
  let failed = false;
  request.mockImplementation(async (input) => {
    if (input.action === 'status' && !failed) {
      failed = true;
      throw new Error('Unavailable');
    }
    return input.action === 'status' ? status : [];
  });
  show();
  await screen.findByText('Personal Data is unavailable.');
  expect(screen.queryByText('Loading Personal Data…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Add item' });
});

it('lets related values have their own autofill mappings and a shared item name', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  fireEvent.change(screen.getByLabelText('Key 1'), {
    target: { value: 'Number' },
  });
  fireEvent.change(screen.getByLabelText('Value 1'), {
    target: { value: '+15555550100' },
  });
  fireEvent.change(screen.getByLabelText('Fill as for value 1'), {
    target: { value: 'tel' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add another value' }));
  fireEvent.change(screen.getByLabelText('Key 2'), {
    target: { value: 'Email' },
  });
  fireEvent.change(screen.getByLabelText('Value 2'), {
    target: { value: 'alex@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Item name (optional)'), {
    target: { value: 'Personal profile' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        item: expect.objectContaining({
          title: 'Personal profile',
          fields: [
            {
              name: 'Number',
              value: '+15555550100',
              secret: false,
              aliases: ['tel'],
            },
            { name: 'Email', value: 'alex@example.com', secret: false },
          ],
        }),
      })
    )
  );
});

it('allows Preferences to browse website data saved in a tab group', async () => {
  request.mockImplementation(async (input) => input.action === 'status'
    ? { ...status, items: input.scope === 'group:studio' ? [{ ...saved, title: 'Website fields', fieldCount: 1 }] : [] }
    : []);
  render(<Theme><PasswordManager tabs={[{ id: 'tab', sessionId: 'studio', sessionName: 'Studio', name: 'Example', url: 'https://example.com' } as any]} /></Theme>);
  await screen.findByText('No saved items yet');
  fireEvent.click(screen.getByRole('button', { name: 'Personal Data group' }));
  fireEvent.click(await screen.findByText('Studio'));
  await screen.findByRole('button', { name: 'Website fields' });
  expect(request).toHaveBeenCalledWith({ action: 'status', scope: 'group:studio' });
});

it('lets a new saved item choose a group independently of the current view', async () => {
  render(<Theme><PasswordManager tabs={[{id:'tab',sessionId:'studio',sessionName:'Studio',name:'Example',url:'https://example.com'} as any]} /></Theme>);
  fireEvent.click(await screen.findByRole('button',{name:'Add item'}));
  const dialog=await screen.findByRole('dialog',{name:'Add saved item'});
  fireEvent.click(within(dialog).getByRole('button',{name:'Save in group'}));
  fireEvent.click(await screen.findByRole('option',{name:'Studio'}));
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Key 1'}),{target:{value:'Name'}});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Value 1'}),{target:{value:'Alex'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'save',destination:'group:studio'})));
});

it('lets an existing group item move to browser-wide storage', async () => {
  const tab={id:'tab',sessionId:'studio',sessionName:'Studio',name:'Example',url:'https://example.com'} as any;
  request.mockImplementation(async input=>input.action==='status'?{...status,items:[{...status.items[0],scope:'group:studio'}]}:input.action==='edit'?{...saved,scope:'group:studio'}:null);
  render(<Theme><PasswordManager group={tab} tabs={[tab]} /></Theme>);
  fireEvent.click(await screen.findByRole('button',{name:'Edit'}));
  const dialog=await screen.findByRole('dialog',{name:'Edit saved item'});
  const selector=within(dialog).getByRole('button',{name:'Save in group'});
  expect(selector).toHaveTextContent('Studio');
  fireEvent.click(selector);
  fireEvent.click(await screen.findByRole('option',{name:'Browser-wide (all groups)'}));
  fireEvent.click(within(dialog).getByRole('button',{name:'Save'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'save',scope:'group:studio',destination:null})));
});

it('fills an empty field name from Fill as and preserves an entered name', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  const field = screen.getByLabelText('Key 1');
  const mapping = screen.getByLabelText('Fill as for value 1');
  fireEvent.change(mapping, { target: { value: 'email' } });
  expect(field).toHaveValue('Email');
  fireEvent.change(field, { target: { value: 'Contact' } });
  fireEvent.change(mapping, { target: { value: 'tel' } });
  expect(field).toHaveValue('Contact');
  fireEvent.change(field, { target: { value: '   ' } });
  fireEvent.change(mapping, { target: { value: 'name' } });
  expect(field).toHaveValue('Full name');
  fireEvent.change(mapping, { target: { value: '' } });
  expect(field).toHaveValue('Full name');
});
