import { IApp } from '../types';
import { groupKey, newGroupName } from './groups';

/** One destination rule for URL entry, suggestions and keyboard activation. */
export function commandDestination(
  apps: IApp[],
  source: IApp | undefined,
  url: string,
  fresh: boolean,
  spaceId: string
): { existing?: IApp; app?: IApp } {
  if (!fresh) {
    const focused =
      source?.url === url &&
      apps.find((app) => app.id === source.id && !app.archived);
    if (focused) return { existing: focused };
    const exact = apps.filter((app) => !app.archived && app.url === url);
    const existing = source
      ? exact.find(
          (app) =>
            groupKey(app) === groupKey(source) &&
            (app.spaceId || 'default') === (source.spaceId || spaceId)
        )
      : exact[0];
    if (existing) return { existing };
  }
  const shared = !fresh && Boolean(source);
  return {
    app: {
      id: crypto.randomUUID(),
      sessionId: shared ? source?.sessionId : crypto.randomUUID(),
      sessionProfileId: shared ? source?.sessionProfileId : undefined,
      sessionIconEmoji: shared ? source?.sessionIconEmoji : undefined,
      sessionIconImage: shared ? source?.sessionIconImage : undefined,
      sessionHomeURL: shared ? source?.sessionHomeURL : undefined,
      sessionName: shared
        ? source?.sessionName || source?.name
        : newGroupName(apps, new URL(url).hostname),
      sessionNameCustom: shared ? source?.sessionNameCustom : false,
      sessionNameGenerated: !shared,
      folderId: shared ? source?.folderId : undefined,
      name: new URL(url).hostname,
      url,
      icon: '',
      spaceId: shared ? source?.spaceId || spaceId : spaceId,
      pinned: !shared,
    },
  };
}
