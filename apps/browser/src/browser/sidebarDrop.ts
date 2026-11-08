import type { IApp } from '../types';
import type { GroupTransferResult } from './groupTransfer';

export type SidebarDropResult =
  | { kind: 'import'; imported: GroupTransferResult | null }
  | {
      kind: 'project';
      token: string;
      name: string;
      slug: string;
      folder: string;
      fileName?: string;
    };
export interface DroppedGroupDraft {
  token: string;
  name: string;
  slug: string;
}
export interface CreatedDroppedGroup {
  tab: IApp;
}
