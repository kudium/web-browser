import { createContext, useEffect, useState } from 'react';
import { resolveAppTheme, type AppTheme } from './appTheme';
import type { Space } from './SpaceManager';

export interface ActiveSpaceTheme {
  spaceId: string;
  color?: string;
}

/** Window-local page color; never replaces the saved space configuration. */
export const SpaceThemeContext = createContext<
  (theme: ActiveSpaceTheme | undefined) => void
>(() => {});

/** All app windows consume the browser owner's resolved theme through one bridge. */
export function useAppTheme(space: Space, pageTheme?: ActiveSpaceTheme) {
  const producer =
    new URL(window.location.href).searchParams.get('view') === 'main';
  const local = resolveAppTheme(
    space,
    pageTheme?.spaceId === space.id ? pageTheme.color : undefined
  );
  const [inherited, setInherited] = useState<AppTheme>();
  useEffect(() => {
    const bridge = window.electron?.appTheme;
    if (!bridge || producer) return undefined;
    let live = true;
    const update = (theme: AppTheme | undefined) => {
      if (live) setInherited(theme);
    };
    let receivedUpdate = false;
    const off = bridge.onChanged((theme) => {
      receivedUpdate = true;
      update(theme);
    });
    bridge
      .get()
      .then((theme) => {
        if (!receivedUpdate) update(theme);
      })
      .catch(() => {});
    return () => {
      live = false;
      off();
    };
  }, [producer]);
  useEffect(() => {
    if (producer) window.electron?.appTheme?.publish(local).catch(() => {});
  }, [producer, local.spaceId, local.primary, local.frame, local.contrast]);
  return producer ? local : inherited || local;
}
