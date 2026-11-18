export interface BrowserProtectionStatus {
  phase: 'ready' | 'updating' | 'stale' | 'unavailable';
  available: boolean;
  updatedAt?: number;
  error?: string;
}
export const protectionListURLs = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
];
