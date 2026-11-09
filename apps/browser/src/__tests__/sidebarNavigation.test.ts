import {
  adjacentSidebarPage,
  swipeDirection,
  DOWNLOADS_PAGE,
  HISTORY_PAGE,
  ARCHIVE_PAGE,
} from '../utils/sidebarNavigation';

it('cycles user spaces and built-in library spaces in either direction', () => {
  const pages = [
    'personal',
    'work',
    DOWNLOADS_PAGE,
    HISTORY_PAGE,
    ARCHIVE_PAGE,
  ];
  expect(adjacentSidebarPage(pages, 'personal', 1)).toBe('work');
  expect(adjacentSidebarPage(pages, 'work', 1)).toBe(DOWNLOADS_PAGE);
  expect(adjacentSidebarPage(pages, DOWNLOADS_PAGE, 1)).toBe(HISTORY_PAGE);
  expect(adjacentSidebarPage(pages, HISTORY_PAGE, 1)).toBe(ARCHIVE_PAGE);
  expect(adjacentSidebarPage(pages, ARCHIVE_PAGE, 1)).toBe('personal');
  expect(adjacentSidebarPage(pages, 'personal', -1)).toBe(ARCHIVE_PAGE);
});
it('requires deliberate horizontal motion and leaves vertical scroll alone', () => {
  expect(swipeDirection(70, 5)).toBe(1);
  expect(swipeDirection(-70, 5)).toBe(-1);
  expect(swipeDirection(20, 0)).toBe(0);
  expect(swipeDirection(70, 65)).toBe(0);
  expect(swipeDirection(5, 120)).toBe(0);
});
