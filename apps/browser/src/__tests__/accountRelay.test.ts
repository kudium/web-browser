/** @jest-environment node */
import { accountRelayStatus, createAccountRelayDevice, registerAccountRelay } from '../main/accountRelay';

test('an isolated environment explains that account connections are unavailable', () => {
  expect(accountRelayStatus()).toMatchObject({ available: false, signedIn: false, reason: expect.stringContaining('unavailable') });
  expect(() => createAccountRelayDevice()).toThrow('unavailable');
});

test('sign-in and secure-storage prerequisites prevent creating a device', () => {
  const create = jest.fn();
  let status = { available: true, signedIn: false, reason: undefined as string | undefined };
  const release = registerAccountRelay(create, () => status);
  try {
    expect(() => createAccountRelayDevice()).toThrow('Sign in to Kudium');
    status = { available: false, signedIn: false, reason: 'Secure storage is unavailable.' };
    expect(() => createAccountRelayDevice()).toThrow('Secure storage');
    expect(create).not.toHaveBeenCalled();
  } finally { release(); }
});

test('account status is credential-free and releasing an older provider keeps its replacement', async () => {
  const old = registerAccountRelay(jest.fn(), () => ({ available: true, signedIn: false }));
  const device = { relayUrl: 'https://browser.kudium.com', deviceId: 'abcdefghijklmnop', deviceToken: 'kd_fixture-private-device-token' };
  const create = jest.fn(async () => device);
  const release = registerAccountRelay(create, () => ({ available: true, signedIn: true }));
  try {
    old();
    expect(accountRelayStatus()).toEqual({ available: true, signedIn: true });
    await expect(createAccountRelayDevice()).resolves.toEqual(device);
    expect(create).toHaveBeenCalledTimes(1);
  } finally { release(); }
});
