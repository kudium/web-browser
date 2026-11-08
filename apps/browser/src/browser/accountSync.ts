import type { IApp } from '../types';
import type { Space } from '../utils/SpaceManager';

export type AccountSyncAction =
  | 'status'
  | 'connect'
  | 'cancel'
  | 'enable'
  | 'disconnect'
  | 'sync'
  | 'snapshot'
  | 'restore'
  | 'delete-data'
  | 'apply-preferences'
  | 'sync-passwords'
  | 'restore-passwords';
export interface RemoteWorkspace {
  recordId: string;
  deviceId: string;
  updatedAt: number;
  groups: number;
  tabs: number;
}
export interface AccountSyncStatus {
  phase:
    | 'off'
    | 'connecting'
    | 'key-required'
    | 'recovery-required'
    | 'ready'
    | 'syncing'
    | 'error';
  connected: boolean;
  email?: string;
  userCode?: string;
  recoveryKey?: string;
  lastSyncedAt?: number;
  message: string;
  remote: RemoteWorkspace[];
  passwordDevices?: { recordId: string; deviceId: string }[];
}
export interface AccountSyncInput {
  recoveryKey?: string;
  savedRecoveryKey?: boolean;
  recordId?: string;
  apps?: IApp[];
  spaces?: Space[];
  currentUrls?: Record<string, string>;
}
export interface RestoredWorkspace {
  apps: IApp[];
  spaces: Space[];
}
