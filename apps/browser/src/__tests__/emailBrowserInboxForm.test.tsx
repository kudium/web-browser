import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { EmailBrowserInboxForm } from '../components/UI/EmailBrowserInboxForm';

const account = { address: 'owner@example.com', tabId: 'mail', url: 'https://mail.google.com/mail/u/1/' };
function mount(email: jest.Mock, groupId = 'work') {
  Object.assign(window, { electron: { email } });
  const save = jest.fn();
  const view = render(<Theme><EmailBrowserInboxForm compact groupId={groupId} groupName="Work" onSave={save} /></Theme>);
  return { save, ...view };
}
it('detects an address and waits for the user to confirm before saving its account route', async () => {
  const email = jest.fn(async () => ({ accounts: [account] }));
  const { save } = mount(email);
  expect(save).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('Email address')).toHaveValue(account.address);
  expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
  expect(email).toHaveBeenCalledWith({ action: 'detectBrowserInbox', groupId: 'work', providerId: 'google' });
  expect(screen.getByRole('status')).toHaveTextContent('Confirm this is your inbox');
  fireEvent.click(screen.getByRole('button', { name: 'Save mailbox' }));
  expect(save).toHaveBeenCalledWith({ providerId: 'google', address: account.address, url: account.url });
});
it('requires an explicit choice when there are multiple signed-in accounts', async () => {
  const email = jest.fn(async () => ({ accounts: [account, { ...account, address: 'personal@example.com', url: 'https://mail.google.com/mail/u/0/' }] }));
  const { save } = mount(email);
  expect(await screen.findByLabelText('Account')).toHaveValue('-1');
  expect(screen.getByRole('button', { name: 'Save mailbox' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Account'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save mailbox' }));
  expect(save).toHaveBeenCalledWith({ providerId: 'google', address: 'personal@example.com', url: 'https://mail.google.com/mail/u/0/' });
});
it('offers manual entry after failure and can retry detection', async () => {
  const email = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ accounts: [account] });
  mount(email);
  expect(await screen.findByLabelText('Email address')).not.toHaveAttribute('readonly');
  expect(screen.getByText(/Couldn’t detect an account/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue(account.address));
  expect(email).toHaveBeenCalledTimes(2);
});
it('never overwrites manual entry with a late detection result', async () => {
  let finish!: (value: unknown) => void;
  const email = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const { save } = mount(email);
  fireEvent.click(screen.getByRole('button', { name: 'Enter address manually' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'manual@example.com' } });
  await act(async () => { finish({ accounts: [account] }); });
  expect(screen.getByLabelText('Email address')).toHaveValue('manual@example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Save mailbox' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ address: 'manual@example.com' }));
});
it('ignores a result from the previous group and provider', async () => {
  let finish!: (value: unknown) => void;
  const email = jest.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ accounts: [] });
  const { rerender, save } = mount(email);
  rerender(<Theme><EmailBrowserInboxForm compact groupId="personal" groupName="Personal" onSave={save} /></Theme>);
  await screen.findByLabelText('Email address');
  fireEvent.change(screen.getByLabelText('Email service'), { target: { value: 'microsoft' } });
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'detectBrowserInbox', groupId: 'personal', providerId: 'microsoft' }));
  await act(async () => { finish({ accounts: [account] }); });
  expect(screen.getByLabelText('Email service')).toHaveValue('microsoft');
  expect(screen.getByLabelText('Email address')).toHaveValue('');
});
