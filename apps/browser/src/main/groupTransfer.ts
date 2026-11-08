import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { showBrowserDialog } from './dialogs';
import { IApp } from '../types';
import {
  PortableGroup,
  parsePortableGroup,
  GroupTransferResult,
} from '../browser/groupTransfer';
import { groupTabs, loginProfileKey } from '../utils/groups';
import {
  getSiteSettings,
  siteOrigin,
  updateSiteSettings,
} from './siteSettings';
import { isGroupLocked } from './groupLocks';

export async function transferGroup(
  host: BrowserWindow,
  tabs: () => IApp[],
  action: unknown,
  id: unknown,
  filePath?: string
): Promise<GroupTransferResult | null> {
  if (action === 'export') {
    const source = tabs().find((tab) => tab.id === id && !tab.archived);
    if (!source || isGroupLocked(source))
      throw new Error('Unlock and select a group to export.');
    const pages = groupTabs(tabs(), source);
    const origins = [
      ...new Set(
        pages
          .map((page) => siteOrigin(page.url))
          .filter((origin): origin is string => !!origin)
      ),
    ];
    const data: PortableGroup = {
      format: 'kudiumbrowser-group',
      version: 1,
      name: source.sessionName || source.name,
      slug: source.sessionSlug,
      emoji: source.sessionIconEmoji,
      homeURL: source.sessionHomeURL,
      pages: pages.map((page) => ({
        name: page.customName || page.name,
        url: page.url,
        pinned: page.tabPinned,
        defaultURL: page.tabDefaultURL,
      })),
      developer: origins.flatMap((origin) => {
        const config = getSiteSettings(
          loginProfileKey(source),
          origin
        ).developer;
        return config ? [{ origin, config }] : [];
      }),
    };
    parsePortableGroup(data);
    const result = await dialog.showSaveDialog(host, {
      defaultPath: `${data.name.replace(/[^\w .-]/g, '_')}.kudiumbrowser-group.json`,
      filters: [{ name: 'Kudium Browser Group', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      if (host.isDestroyed() || isGroupLocked(source))
        throw new Error('Group access changed.');
      await fs.promises.writeFile(
        result.filePath,
        JSON.stringify(data, null, 2),
        { mode: 0o600 }
      );
    }
    return null;
  }
  if (action !== 'import' || typeof id !== 'string' || id.length > 200)
    throw new Error('Choose a group transfer action.');
  let selectedPath = filePath;
  if (!selectedPath) {
    const selected = await dialog.showOpenDialog(host, {
      properties: ['openFile'],
      filters: [{ name: 'Kudium Browser Group', extensions: ['json'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    [selectedPath] = selected.filePaths;
  }
  const file = await fs.promises.open(selectedPath, 'r');
  let data: PortableGroup;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
      throw new Error('Choose a group file smaller than 8 MB.');
    data = parsePortableGroup(JSON.parse(await file.readFile('utf8')));
  } finally {
    await file.close();
  }
  const hooks = data.developer.filter(
    ({ config }) =>
      config.before || config.after || config.css || config.hooks?.length
  );
  const affected = data.pages.filter((page) =>
    hooks.some((entry) => siteOrigin(page.url) === entry.origin)
  );
  const confirmation = await showBrowserDialog(host, {
    type: 'question',
    message: `Import “${data.name.slice(0, 60)}”?`,
    detail: `${data.pages.length} tabs will be added as a new group. Logins and private data are not included.`,
    importReview: {
      pages: data.pages.map((page) => ({
        name: page.name,
        url: `${new URL(page.url).hostname}${new URL(page.url).pathname}`,
        hooks: affected.includes(page),
      })),
      hooks: hooks.map(({ origin, config }) => ({
        origin,
        source: [
          config.before ? `Before page load\n${config.before}` : '',
          config.after ? `After page load\n${config.after}` : '',
          config.css ? `Styles\n${config.css}` : '',
          ...(config.hooks || []).map((hook) =>
            [
              `${hook.name} · ${hook.path}`,
              hook.before ? `Before page load\n${hook.before}` : '',
              hook.after ? `After page load\n${hook.after}` : '',
              hook.css ? `Styles\n${hook.css}` : '',
            ]
              .filter(Boolean)
              .join('\n\n')
          ),
        ]
          .filter(Boolean)
          .join('\n\n'),
      })),
    },
    buttons: [hooks.length ? 'Import & Review' : 'Import Group', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0 || host.isDestroyed()) return null;
  const sessionId = randomUUID();
  // A fresh profile carries no cookies, permission grants or project authority.
  data.developer.forEach(({ origin, config }) =>
    updateSiteSettings(sessionId, origin, {
      developer: {
        ...config,
        enabled: false,
        hooks: config.hooks?.map((hook) => ({ ...hook, enabled: false })),
      },
    })
  );
  return {
    reviewHooks: !!hooks.length,
    tabs: data.pages.map((page) => ({
      id: randomUUID(),
      sessionId,
      spaceId: id,
      name: page.name,
      customName: page.name,
      url: page.url,
      icon: '',
      sessionName: data.name,
      sessionNameCustom: true,
      sessionSlug: data.slug,
      sessionIconEmoji: data.emoji,
      sessionHomeURL: data.homeURL,
      tabPinned: page.pinned === true,
      tabDefaultURL: page.defaultURL,
      pinned: true,
    })),
  };
}
