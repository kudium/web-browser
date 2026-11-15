import type { WebContents } from 'electron';

export interface MediaPlayerSnapshot {
  explicit: boolean;
  track: boolean;
  resumable: boolean;
  hasMedia: boolean;
}

// Muted, looping background video and short effects are not player sessions.
export const SIDEBAR_MEDIA_CACHE_KEY = '__kudiumSidebarMediaCacheV1';
const playerSnapshot = `(() => {
  const key = '${SIDEBAR_MEDIA_CACHE_KEY}';
  let cache = window[key];
  if (!cache || cache.document !== document) {
    const elements = new Set();
    const roots = new Map();
    const events = ['playing', 'pause', 'ended', 'volumechange', 'loadedmetadata', 'durationchange', 'emptied'];
    let dirty = true;
    const invalidate = () => { dirty = true; };
    const scan = node => {
      if (node instanceof HTMLMediaElement) elements.add(node);
      if (node.shadowRoot) observe(node.shadowRoot);
      if (node.querySelectorAll) {
        for (const child of node.querySelectorAll('*')) {
          if (child instanceof HTMLMediaElement) elements.add(child);
          if (child.shadowRoot) observe(child.shadowRoot);
        }
      }
    };
    const prune = () => {
      for (const media of elements) if (!media.isConnected) elements.delete(media);
      for (const [root, observer] of roots) {
        if (root.host && !root.host.isConnected) {
          observer.disconnect();
          for (const event of events) root.removeEventListener(event, invalidate, true);
          roots.delete(root);
        }
      }
    };
    const observe = root => {
      if (roots.has(root)) return;
      const observer = new MutationObserver(records => {
        let changed = false;
        for (const record of records) {
          if (record.type === 'attributes') { changed = true; continue; }
          for (const node of record.addedNodes) { scan(node); changed = true; }
          if (record.removedNodes.length) changed = true;
        }
        if (changed) { prune(); invalidate(); }
      });
      roots.set(root, observer);
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['muted', 'loop', 'controls', 'src'] });
      for (const event of events) root.addEventListener(event, invalidate, true);
      scan(root);
    };
    let lastSnapshot;
    let lastMetadata;
    let lastPlaybackState;
    cache = {
      document,
      read() {
        const session = navigator.mediaSession;
        const metadata = session?.metadata;
        // Metadata has no standard change event. Recheck only its small fields.
        const explicit = Boolean(metadata?.title &&
          (metadata.artist || metadata.album || metadata.artwork?.length));
        if (lastMetadata !== explicit || lastPlaybackState !== session?.playbackState) dirty = true;
        lastMetadata = explicit;
        lastPlaybackState = session?.playbackState;
        // Connectivity/currentTime can change without a media event.
        const connected = [...elements].filter(media => {
          if (media.isConnected) return true;
          elements.delete(media);
          dirty = true;
          return false;
        });
        const resumable = connected.some(media => !media.ended && !media.loop &&
          !media.muted && media.volume > 0 && media.currentTime > 0 &&
          (media.duration >= 30 || (media.controls && media.duration >= 10))) ||
          (explicit && session?.playbackState === 'paused');
        if (!dirty && lastSnapshot?.resumable === resumable) return lastSnapshot;
        const candidates = connected.filter(media => !media.muted && media.volume > 0 &&
          !media.ended && !media.loop &&
          (media.duration >= 30 || (media.controls && media.duration >= 10)));
        dirty = false;
        lastSnapshot = { explicit, track: candidates.some(media => !media.paused), resumable, hasMedia: elements.size > 0 };
        return lastSnapshot;
      },
      dispose() {
        for (const [root, observer] of roots) {
          observer.disconnect();
          for (const event of events) root.removeEventListener(event, invalidate, true);
        }
        roots.clear();
        elements.clear();
        if (window[key] === cache) delete window[key];
      }
    };
    observe(document);
    window[key] = cache;
  }
  return cache.read();
})()`;

export function createSidebarMediaSession(
  contents: Pick<
    WebContents,
    'executeJavaScript' | 'isDestroyed' | 'isCurrentlyAudible' | 'isAudioMuted'
  >,
  playing: () => boolean,
  changed: () => void,
) {
  let eligible = false;
  let audibleSince: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;
  const setEligible = (next: boolean) => {
    if (eligible === next) return;
    eligible = next;
    changed();
  };
  const cancel = () => {
    generation += 1;
    clearTimeout(timer);
    timer = undefined;
  };
  const refresh = async () => {
    cancel();
    const current = generation;
    if (disposed || contents.isDestroyed()) return;
    let snapshot: MediaPlayerSnapshot;
    try {
      snapshot = await contents.executeJavaScript(playerSnapshot);
      if (!snapshot || typeof snapshot.track !== 'boolean')
        throw new Error('Media inspection unavailable');
    } catch {
      if (disposed || current !== generation || contents.isDestroyed()) return;
      audibleSince = undefined;
      setEligible(false);
      if (playing())
        timer = setTimeout(() => {
          void refresh();
        }, 15000);
      return;
    }
    if (disposed || current !== generation || contents.isDestroyed()) return;
    const audible = contents.isCurrentlyAudible() && !contents.isAudioMuted();
    // Inaccessible embedded players can qualify through sustained audible
    // playback; visible decorative media cannot use this fallback.
    const player = snapshot.explicit || snapshot.track || !snapshot.hasMedia;
    if ((playing() || snapshot.track) && audible && player) {
      audibleSince ??= Date.now();
      const threshold = snapshot.explicit || snapshot.track ? 5000 : 10000;
      if (Date.now() - audibleSince >= threshold) setEligible(true);
    } else {
      audibleSince = undefined;
      if (!snapshot.resumable) setEligible(false);
    }
    if (playing() || snapshot.track || eligible) {
      const threshold = snapshot.explicit || snapshot.track ? 5000 : 10000;
      // One deadline to qualify playback, then only small cached-state checks.
      // Rejected decorative media uses a slower fallback for metadata/settings
      // changes that Electron does not expose as native playback events.
      const delay =
        audibleSince !== undefined && !eligible
          ? Math.max(1, threshold - (Date.now() - audibleSince))
          : player || eligible
            ? 5000
            : 15000;
      timer = setTimeout(() => {
        void refresh();
      }, delay);
    }
  };
  const reset = () => {
    cancel();
    audibleSince = undefined;
    setEligible(false);
  };
  return {
    get eligible() {
      return eligible;
    },
    refresh: () => {
      void refresh();
    },
    reset,
    dispose: () => {
      disposed = true;
      reset();
      if (!contents.isDestroyed()) {
        void contents
          .executeJavaScript(`window['${SIDEBAR_MEDIA_CACHE_KEY}']?.dispose()`)
          .catch(() => {});
      }
    },
  };
}
