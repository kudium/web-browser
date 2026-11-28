import type { MCPRelayAccountStatus } from '../browser/mcpRelay';
export interface AccountRelayDevice {
  relayUrl: string;
  deviceId: string;
  deviceToken: string;
}
let provider:
  | {
      create: () => Promise<AccountRelayDevice>;
      status: () => MCPRelayAccountStatus;
    }
  | undefined;
export function registerAccountRelay(
  create: () => Promise<AccountRelayDevice>,
  status: () => MCPRelayAccountStatus
) {
  const current = { create, status };
  provider = current;
  return () => {
    if (provider === current) provider = undefined;
  };
}
export function accountRelayStatus(): MCPRelayAccountStatus {
  return (
    provider?.status() || {
      available: false,
      signedIn: false,
      reason:
        'Account connections are unavailable in this environment. Use a regular Kudium browser window.',
    }
  );
}
/** Account and device credentials stay in the main process. */
export function createAccountRelayDevice() {
  const status = accountRelayStatus();
  if (!status.available) throw new Error(status.reason);
  if (!status.signedIn)
    throw new Error(
      'Sign in to Kudium in Preferences → Sync, then connect the relay.'
    );
  return provider!.create();
}
