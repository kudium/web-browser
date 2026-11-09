export const DOWNLOADS_PAGE = '@downloads';
export const HISTORY_PAGE = '@history';
export const ARCHIVE_PAGE = '@archive';
export function adjacentSidebarPage(
  pages: string[],
  current: string,
  direction: number
) {
  const index = Math.max(0, pages.indexOf(current));
  return pages[(index + (direction > 0 ? 1 : pages.length - 1)) % pages.length];
}
export function swipeDirection(x: number, y: number) {
  if (Math.abs(x) < 48 || Math.abs(x) < Math.abs(y) * 1.5) return 0;
  return x > 0 ? 1 : -1;
}
