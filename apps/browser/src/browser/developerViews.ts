const key = 'kudiumbrowser.developer.views';
const eventName = 'kudiumbrowser-developer-view-changed';
export function readDeveloperViews(): Record<string, 'pages' | 'files'> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([, value]) => value === 'pages' || value === 'files'
      )
    ) as Record<string, 'pages' | 'files'>;
  } catch {
    return {};
  }
}
export function setDeveloperView(group: string, view: 'pages' | 'files') {
  const views = { ...readDeveloperViews(), [group]: view };
  try {
    localStorage.setItem(key, JSON.stringify(views));
  } catch {
    /* Keep the current view usable. */
  }
  window.dispatchEvent(new CustomEvent(eventName, { detail: views }));
}
export function watchDeveloperViews(
  listener: (views: Record<string, 'pages' | 'files'>) => void
) {
  const changed = (event: Event) =>
    listener((event as CustomEvent<Record<string, 'pages' | 'files'>>).detail);
  window.addEventListener(eventName, changed);
  return () => window.removeEventListener(eventName, changed);
}
