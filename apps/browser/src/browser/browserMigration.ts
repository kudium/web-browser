import type { ImportedLink } from './browserImport';

export interface MigrationProfile {
  id: string;
  browser: string;
  name: string;
  bookmarks: boolean;
  history: boolean;
  cookies: boolean;
}
export interface MigrationRequest {
  destinationSpace?: string;
  profileId: string;
  bookmarks: boolean;
  history: boolean;
  cookies: boolean;
}
export interface MigrationPreview {
  token: string;
  profileId: string;
  links: ImportedLink[];
  history: number;
  cookies: boolean;
  warnings?: string[];
}
export interface MigrationResult {
  history: number;
  cookies: number;
  skippedCookies: number;
  warning?: string;
  omittedCookies?: number;
  retryable?: boolean;
}

export interface MigrationProgress {
  stage: string;
  completed: number;
  total: number;
}

export interface MigrationRecovery extends MigrationPreview {
  source: MigrationProfile;
  destinationSpace?: string;
  organization?: import('./importWorkspace').ImportOrganizationOptions;
}
