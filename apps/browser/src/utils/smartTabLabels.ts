export interface TabIdentity {
  id: string;
  title: string;
  url: string;
  customName?: string;
}

/** Presentation only: keep stored titles and user names intact. */
export function smartTabLabels(
  tabs: TabIdentity[],
  enabled = true
): Map<string, string> {
  const labels = new Map<string, string>();
  tabs.forEach((tab) => {
    let label = tab.customName || tab.title;
    if (enabled && !tab.customName) {
      const peers = tabs.filter(
        (peer) => peer.id !== tab.id && !peer.customName
      );
      let prefixLength = 0;
      peers.forEach((peer) => {
        if (peer.title === tab.title) return;
        let index = 0;
        while (
          index < Math.min(peer.title.length, tab.title.length) &&
          peer.title[index].toLowerCase() === tab.title[index].toLowerCase()
        )
          index += 1;
        const shared = tab.title.slice(0, index).replace(/\S+$/, '');
        if (shared.trim().length >= 4)
          prefixLength = Math.max(prefixLength, shared.length);
      });
      if (prefixLength)
        label =
          tab.title
            .slice(prefixLength)
            .replace(/^[\s:|–—-]+/, '')
            .trim() || tab.title;
      if (peers.some((peer) => peer.title === tab.title)) {
        try {
          const url = new URL(tab.url);
          const path = decodeURIComponent(url.pathname)
            .split('/')
            .filter(Boolean)
            .reverse()
            .join(' / ')
            .replace(/[-_]+/g, ' ');
          label = path || url.hostname;
        } catch {
          label = tab.title;
        }
      }
    }
    labels.set(tab.id, label);
  });
  const originalLabels = new Map(labels);
  if (enabled)
    tabs.forEach((tab) => {
      if (tab.customName) return;
      const label = labels.get(tab.id) || tab.title;
      const matches = tabs.filter(
        (peer) => originalLabels.get(peer.id) === label && !peer.customName
      );
      if (matches.length > 1)
        labels.set(
          tab.id,
          `${label} · ${matches.findIndex((peer) => peer.id === tab.id) + 1}`
        );
    });
  return labels;
}
