/** Reveal a clipped tab without scrolling the browser chrome or workspace. */
export function revealHorizontalTab(tab: HTMLElement) {
  const list = tab.closest<HTMLElement>('.horizontal-tabs');
  if (!list || list.dataset.overflow === 'dropdown') return;
  const viewport = list.getBoundingClientRect();
  const bounds = tab.getBoundingClientRect();
  let delta = 0;
  if (bounds.width > viewport.width) {
    if (bounds.right <= viewport.left || bounds.left >= viewport.right)
      delta = bounds.left - viewport.left;
  } else if (bounds.left < viewport.left - 1) delta = bounds.left - viewport.left;
  else if (bounds.right > viewport.right + 1) delta = bounds.right - viewport.right;
  if (!delta) return;
  list.scrollLeft = Math.max(0, Math.min(list.scrollWidth - list.clientWidth, list.scrollLeft + delta));
}
