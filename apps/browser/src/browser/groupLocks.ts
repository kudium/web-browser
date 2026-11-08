export interface GroupLockState {
  protected: string[];
  unlocked: string[];
  available: boolean;
  error?: string;
}
export interface GroupLockRequest {
  action: 'status' | 'protect' | 'unlock' | 'lock' | 'unprotect';
  groupId?: string;
}
