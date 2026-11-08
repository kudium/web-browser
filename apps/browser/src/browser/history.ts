export interface HistoryRecord {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  profile: string;
}
export type HistoryAction = 'get' | 'clear' | 'remove';
