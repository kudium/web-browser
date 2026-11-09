import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PasswordManager } from '../components/View/Settings/PasswordManager';

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
    },
  });
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
