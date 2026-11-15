import type { IApp } from '../types';
import type { Space } from '../utils/SpaceManager';

export type AccountSyncAction =
  | 'status'
  | 'connect'
  | 'cancel'
  | 'enable'
  | 'unlock'
  | 'reset-sync'
  | 'disconnect'
  | 'sync'
  | 'snapshot'
  | 'restore'
  | 'delete-data'
  | 'apply-preferences'
  | 'sync-personal-data'
  | 'sync-notes'
  | 'restore-notes'
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
  noteDevices?: { recordId: string; deviceId: string }[];
  passwordDevices?: { recordId: string; deviceId: string }[];
}
export interface AccountSyncInput {
  authMode?: 'sign-in' | 'sign-up';
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
