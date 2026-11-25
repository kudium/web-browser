/* Sequential profile updates share extension files; ordering prevents conflicting installs. */
/* eslint-disable no-restricted-syntax, no-await-in-loop */
import {
  app,
  BrowserWindow,
  MenuItemConstructorOptions,
  Session,
  WebContents,
  IpcMainInvokeEvent,
  session,
} from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import {
  installChromeWebStore,
  updateExtensions,
} from 'electron-chrome-web-store';
import fs from 'fs';
import path from 'path';
import { nativeMenuLabels } from '../browser/menuLabels';
import { showBrowserDialog } from './dialogs';
import { watchIPCRequest } from './ipcRequestBinding';
import { prepareExtensionPackage } from './extensionPackage';
import { configureExtensionStoreCompatibility } from './extensionStoreCompatibility';
import { attachExtensionSidePanels } from './extensionSidePanels';
import { attachExtensionBrowserAPIs } from './extensionBrowserAPIs';

function packageName(
  prepared: Awaited<ReturnType<typeof prepareExtensionPackage>>
) {
  return prepared.displayName || prepared.manifest.name;
}

let toolbar = {
  getOrder: (): string[] | null => null,
  saveOrder: (_order: string[] | null) => {},
};
export function configureExtensionToolbar(adapter: typeof toolbar) {
  toolbar = adapter;
}

interface InstalledExtension {
  id: string;
  path: string;
  name: string;
  enabled: boolean;
  scope: 'all' | 'selected';
  profiles: string[];
  excluded: string[];
}
interface Profile {
  revision: number;
  id: string;
  name: string;
  installTarget?: string;
  session: Session;
  owner?: BrowserWindow;
  api: ElectronChromeExtensions;
  ready: Promise<void>;
  handlers: Partial<ConstructorParameters<typeof ElectronChromeExtensions>[0]>;
}
const profiles = new Map<string, Profile>();
const storeInstallers = new WeakMap<
  WebContents,
  {
    profileId: string;
    install: (
      event: IpcMainInvokeEvent,
      details: unknown
    ) => Promise<{ result: string; message?: string }>;
  }
>();

let catalogRevision = 0;
const installing = new Set<string>();
const active = new Map<number, string>();
const failures = new Map<string, string>();
const pending = new Map<
  string,
  Pick<InstalledExtension, 'scope' | 'profiles' | 'excluded'>
>();
const catalogFile = () => path.join(app.getPath('userData'), 'extensions.json');
const extensionFiles = () => path.join(app.getPath('userData'), 'Extensions');
function read(): InstalledExtension[] {
  try {
    const saved: unknown = JSON.parse(fs.readFileSync(catalogFile(), 'utf8'));
    if (!Array.isArray(saved)) return [];
    const seen = new Set<string>();
    return saved.flatMap((value: unknown) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as InstalledExtension;
      const validList = (list: unknown) =>
        list === undefined ||
        (Array.isArray(list) &&
          list.every((id) => typeof id === 'string' && id.length > 0));
      if (
        ![item.id, item.path, item.name].every(
          (field) => typeof field === 'string' && field.length > 0
        ) ||
        typeof item.enabled !== 'boolean' ||
        (item.scope !== undefined &&
          item.scope !== 'all' &&
          item.scope !== 'selected') ||
        !validList(item.profiles) ||
        !validList(item.excluded) ||
        seen.has(item.id)
      )
        return [];
      seen.add(item.id);
      return [
        {
          id: item.id,
          path: item.path,
          name: item.name,
          enabled: item.enabled,
          // Catalogs predating per-session access used global installation.
          scope: item.scope ?? 'all',
          profiles: item.profiles ?? [],
          excluded: item.excluded ?? [],
        },
      ];
    });
  } catch {
    return [];
  }
}
function save(items: InstalledExtension[]) {
  const target = catalogFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(items));
  fs.renameSync(`${target}.tmp`, target);
  catalogRevision += 1;
}
export function extensionAllowed(
  item: Pick<InstalledExtension, 'enabled' | 'scope' | 'profiles' | 'excluded'>,
  profileId: string
) {
  return (
    item.enabled &&
    (item.scope === 'all'
      ? !item.excluded.includes(profileId)
      : item.profiles.includes(profileId))
  );
}
async function reconcileProfiles(targets: Profile[]) {
  const items = read();
  for (const profile of targets) {
    const extensions = profile.session.extensions.getAllExtensions();
    const byId = new Map(
      extensions.map((extension) => [extension.id, extension])
    );
    const byPath = new Map(
      extensions.map((extension) => [extension.path, extension])
    );
    for (const item of items) {
      const loaded = byId.get(item.id) || byPath.get(item.path);
      if (extensionAllowed(item, profile.id)) {
        if (!loaded) {
          try {
            const extension = await profile.session.extensions.loadExtension(
              item.path
            );
            if (extension && extension.id !== item.id) {
              profile.session.extensions.removeExtension(extension.id);
              throw new Error('Loaded extension identity changed.');
            }
            if (extension) {
              byId.set(extension.id, extension);
              byPath.set(extension.path, extension);
            }
            failures.delete(`${profile.id}:${item.id}`);
          } catch (error) {
            failures.set(`${profile.id}:${item.id}`, String(error));
          }
        }
      } else if (loaded) profile.session.extensions.removeExtension(loaded.id);
    }
  }
}
let reconciliation = Promise.resolve();
function reconcile(targets?: Profile[]) {
  const operation = reconciliation.then(() =>
    reconcileProfiles(targets || [...profiles.values()])
  );
  // A failed pass must not prevent subsequent policy changes or retries.
  reconciliation = operation.catch(() => {});
  return operation;
}
let mutation = Promise.resolve();
function queueMutation(operation: () => Promise<void>) {
  const result = mutation.then(operation);
  // Reject this caller without preventing future extension policy changes.
  mutation = result.catch(() => {});
  return result;
}
function change(operation: () => Promise<void>, owner: BrowserWindow) {
  queueMutation(operation).catch(async (error) => {
    await showBrowserDialog(owner, {
      message: 'Extension could not be updated',
      detail: 'Try again or review the error details below.',
      technicalDetail: String(error),
      buttons: ['Done'],
    });
  });
}
let updateTimer: ReturnType<typeof setInterval> | undefined;
export function getExtensionProfiles() {
  return [...profiles.values()].filter(
    (profile): profile is Profile & { owner: BrowserWindow } =>
      Boolean(profile.owner)
  );
}
/** Only an owning workspace main frame may use cross-session toolbar APIs. */
export function extensionRemoteAuthority(
  event: IpcMainInvokeEvent,
  target?: Session
) {
  return (
    !event.sender.isDestroyed() &&
    event.senderFrame === event.sender.mainFrame &&
    getExtensionProfiles().some(
      (profile) =>
        (!target || profile.session === target) &&
        !profile.owner.isDestroyed() &&
        profile.owner.webContents === event.sender
    )
  );
}
Object.defineProperty(
  global,
  Symbol.for('kudiumbrowser.extensionRemoteAuthority'),
  {
    configurable: true,
    value: extensionRemoteAuthority,
  }
);
export async function updateInstalledExtensions() {
  const scope = getExtensionProfiles().map((profile) => ({
    profile,
    owner: profile.owner,
    revision: profile.revision,
  }));
  let expectedRevision = catalogRevision;
  const processed = new Set<string>();
  const assertScope = () => {
    const current = getExtensionProfiles();
    if (
      catalogRevision !== expectedRevision ||
      current.length !== scope.length ||
      scope.some(
        ({ profile, owner, revision }) =>
          !current.includes(profile) ||
          profile.owner !== owner ||
          profile.revision !== revision ||
          owner.isDestroyed()
      )
    )
      throw new Error('Extension update ownership or policy changed.');
  };
  const ownedUpdater = updateExtensions as (
    target: Session,
    applyUpdate: (
      update: { id: string; version: string; extension: { path: string } },
      candidatePath: string
    ) => Promise<void>
  ) => Promise<void>;
  for (const { profile, owner } of scope) {
    await profile.ready;
    assertScope();
    if (
      !profile.session.extensions
        .getAllExtensions()
        .some((extension) => !processed.has(extension.id))
    ) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // This callback is awaited within the serialized extension mutation.
    // eslint-disable-next-line no-loop-func
    await ownedUpdater(profile.session, async (update, candidatePath) => {
      assertScope();
      if (processed.has(update.id)) return;
      processed.add(update.id);
      const original = read().find((item) => item.id === update.id);
      if (!original || original.path !== update.extension.path) return;
      const targets = scope
        .map((entry) => entry.profile)
        .filter((target) => extensionAllowed(original, target.id));
      if (!targets.length) return;
      const oldLoads = targets.filter((target) =>
        target.session.extensions.getExtension(update.id)
      );
      const cancellation = new AbortController();
      const deadline = Date.now() + 120000;
      const timer = setTimeout(() => cancellation.abort(), 120000);
      timer.unref?.();
      const check = () => {
        assertScope();
        if (cancellation.signal.aborted || Date.now() >= deadline)
          throw new Error('Extension update review expired.');
      };
      let prepared:
        | Awaited<ReturnType<typeof prepareExtensionPackage>>
        | undefined;
      let published: InstalledExtension | undefined;
      const replaced: Profile[] = [];
      try {
        prepared = await prepareExtensionPackage(
          update.id,
          extensionFiles(),
          app.getPath('userData'),
          check,
          candidatePath
        );
        check();
        if (prepared.manifest.version !== update.version)
          throw new Error('Extension update version does not match.');
        const answer = await showBrowserDialog(owner, {
          signal: cancellation.signal,
          title: 'Update extension',
          message: `Update ${packageName(prepared)}?`,
          detail: `Version ${prepared.manifest.version}\nApplies to: ${targets
            .map((target) => target.name)
            .join(', ')}\nReview all requested permissions before updating.`,
          permissions: prepared.permissions,
          buttons: ['Cancel', 'Update extension'],
          defaultId: 0,
          cancelId: 0,
        });
        check();
        if (answer.response !== 1) return;
        await prepared.validate();
        check();
        const packagePath = await prepared.commit();
        check();
        const next = {
          ...original,
          path: packagePath,
          name: packageName(prepared),
        };
        save(read().map((item) => (item.id === update.id ? next : item)));
        published = next;
        expectedRevision = catalogRevision;
        for (const target of targets) {
          check();
          replaced.push(target);
          if (target.session.extensions.getExtension(update.id))
            target.session.extensions.removeExtension(update.id);
          check();
          // The authority check and native dispatch are synchronous.
          const load = target.session.extensions.loadExtension(packagePath);
          const loaded = await load;
          if (loaded.id !== update.id) {
            target.session.extensions.removeExtension(loaded.id);
            throw new Error('Updated extension identity changed.');
          }
          check();
          failures.delete(`${target.id}:${update.id}`);
        }
        prepared.retain();
      } catch (error) {
        failures.set(`${profile.id}:${update.id}`, String(error));
        // Retain the old package: another profile or crash recovery may need it.
        if (published) {
          try {
            for (const target of replaced) {
              if (
                target.session.extensions.getExtension(update.id)?.path ===
                prepared?.path()
              )
                target.session.extensions.removeExtension(update.id);
            }
            if (
              JSON.stringify(read().find((item) => item.id === update.id)) ===
              JSON.stringify(published)
            )
              save(
                read().map((item) => (item.id === update.id ? original : item))
              );
            expectedRevision = catalogRevision;
            for (const target of oldLoads) {
              const policy = read().find((item) => item.id === update.id);
              const bound = scope.find((entry) => entry.profile === target);
              if (
                policy?.path === original.path &&
                extensionAllowed(policy, target.id) &&
                target.owner === bound?.owner &&
                target.revision === bound?.revision &&
                target.owner &&
                !target.owner.isDestroyed() &&
                !target.session.extensions.getExtension(update.id)
              )
                await target.session.extensions.loadExtension(original.path);
            }
          } catch (recoveryError) {
            failures.set(`${profile.id}:${update.id}`, String(recoveryError));
          }
        }
        throw error;
      } finally {
        clearTimeout(timer);
        await prepared?.dispose();
      }
    });
  }
  await reconcile();
}
export function setActiveExtensionProfile(
  owner: BrowserWindow,
  profileId: string
) {
  active.set(owner.id, profileId);
}
export function installedExtensionOrigins() {
  return read().map((item) => `chrome-extension://${item.id}`);
}
export function getExtensionProfile(profileId: string) {
  return getExtensionProfiles().find((profile) => profile.id === profileId);
}
export function releaseExtensionOwner(owner: BrowserWindow) {
  active.delete(owner.id);
  for (const profile of profiles.values()) {
    if (profile.owner === owner) {
      profile.revision += 1;
      profile.owner = undefined;
      Object.keys(profile.handlers).forEach((key) => {
        delete (profile.handlers as Record<string, unknown>)[key];
      });
      profile.installTarget = undefined;
      for (const key of pending.keys()) {
        if (key.startsWith(`${profile.id}:`)) pending.delete(key);
      }
    }
  }
}
export async function applyExtensions(
  browserSession: Session,
  profileId: string,
  name: string,
  owner: BrowserWindow,
  callbacks: Partial<
    ConstructorParameters<typeof ElectronChromeExtensions>[0]
  > = {}
) {
  const existing = profiles.get(profileId);
  if (existing) {
    if (existing.owner !== owner || existing.name !== name)
      existing.revision += 1;
    existing.name = name;
    existing.owner = owner;
    Object.keys(existing.handlers).forEach((key) => {
      delete (existing.handlers as Record<string, unknown>)[key];
    });
    Object.assign(existing.handlers, callbacks);
    return existing.ready;
  }
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  const handlers = { ...callbacks };
  const api = new ElectronChromeExtensions({
    session: browserSession,
    createTab: (details) => {
      if (!handlers.createTab) throw new Error('Tab creation is unavailable');
      return handlers.createTab(details);
    },
    selectTab: (tab, host) => handlers.selectTab?.(tab, host),
    removeTab: (tab, host) => handlers.removeTab?.(tab, host),
    requestPermissions: (extension, permissions) =>
      handlers.requestPermissions?.(extension, permissions) ||
      Promise.resolve(false),
  });
  attachExtensionSidePanels(api, profileId);
  attachExtensionBrowserAPIs(api);
  const profile: Profile = {
    revision: 0,
    id: profileId,
    name,
    session: browserSession,
    owner,
    api,
    ready: Promise.resolve(),
    handlers,
  };
  profiles.set(profileId, profile);
  browserSession.serviceWorkers.on('console-message', (_event, details) => {
    if (
      details.level < 3 ||
      !details.sourceUrl.startsWith('chrome-extension://')
    )
      return;
    const extensionId = new URL(details.sourceUrl).hostname;
    failures.set(`${profileId}:${extensionId}`, details.message);
  });
  browserSession.extensions.on('extension-loaded', (_event, extension) => {
    const items = read();
    const old = items.find(
      (item) => item.id === extension.id || item.path === extension.path
    );
    if (old && old.id !== extension.id) {
      // A load acknowledgment must never rewrite a reviewed package's identity.
      failures.set(
        `${profileId}:${old.id}`,
        'Loaded extension identity changed.'
      );
      browserSession.extensions.removeExtension(extension.id);
      return;
    }
    if (!old) {
      items.push({
        id: extension.id,
        path: extension.path,
        name: extension.name,
        enabled: true,
        ...(pending.get(`${profileId}:${extension.id}`) || {
          scope: 'selected',
          profiles: [profileId],
          excluded: [],
        }),
      });
      pending.delete(`${profileId}:${extension.id}`);
      save(items);
      if (profile.owner) change(reconcile, profile.owner);
    } else {
      const requested = pending.get(`${profileId}:${extension.id}`);
      if (requested) {
        old.enabled = true;
        if (requested.scope === 'all') {
          old.scope = 'all';
          old.excluded = [];
        } else if (old.scope === 'all')
          old.excluded = old.excluded.filter(
            (id) => !requested.profiles.includes(id)
          );
        else
          old.profiles = [...new Set([...old.profiles, ...requested.profiles])];
        pending.delete(`${profileId}:${extension.id}`);
      }
      if (requested || old.id !== extension.id || old.path !== extension.path) {
        old.id = extension.id;
        old.path = extension.path;
        save(items);
      }
      if (requested && profile.owner) change(reconcile, profile.owner);
    }
  });
  profile.ready = installChromeWebStore({
    session: browserSession,
    extensionsPath: extensionFiles(),
    loadExtensions: false,
    autoUpdate: false,
    minimumManifestVersion: 3,
    // Only the owned WebContents handler below may authorize installation.
    beforeInstall: async () => ({ action: 'deny' }),
  }).then(async () => {
    // Startup only initializes this session; global passes are for policy changes.
    await reconcile([profile]);
    return undefined;
  });
  if (!updateTimer) {
    updateTimer = setInterval(() => {
      const liveOwner = getExtensionProfiles()[0]?.owner;
      if (liveOwner) change(updateInstalledExtensions, liveOwner);
    }, 5 * 60 * 60 * 1000);
    updateTimer.unref();
  }
  return profile.ready;
}
async function openStore(profile: Profile) {
  await profile.ready;
  if (!profile.owner) return;
  profile.owner.webContents.send('browser-tab-request', {
    action: 'store',
    profileId: profile.installTarget || profile.id,
  });
}
export function setExtensionInstallTarget(
  profileId: string,
  targetId?: string
) {
  const profile = profiles.get(profileId);
  if (profile && profile.installTarget !== targetId) {
    profile.revision += 1;
    profile.installTarget = targetId;
  }
}
/**
 * Store metadata follows the chosen app, without running its extensions in the
 * store profile.
 */
export function configureExtensionStore(
  contents: WebContents,
  profileId: string
) {
  configureExtensionStoreCompatibility(contents);
  const target = () => {
    const profile = profiles.get(profileId);
    return profiles.get(profile?.installTarget || '') || profile;
  };
  const trusted = (event: IpcMainInvokeEvent) => {
    const profile = profiles.get(profileId);
    return (
      !contents.isDestroyed() &&
      event.sender === contents &&
      event.senderFrame === contents.mainFrame &&
      event.senderFrame?.origin === 'https://chromewebstore.google.com' &&
      profile?.session === contents.session &&
      !!profile?.owner &&
      !profile.owner.isDestroyed()
    );
  };
  const validId = (id: unknown) =>
    typeof id === 'string' && id.length > 0 && id.length <= 128;
  const install = async (event: IpcMainInvokeEvent, details: unknown) => {
    if (!trusted(event)) throw new Error('Untrusted extension store request');
    if (!details || typeof details !== 'object' || Array.isArray(details))
      throw new Error('Invalid extension installation request');
    const { id } = details as { id?: unknown };
    if (typeof id !== 'string' || !/^[a-p]{32}$/.test(id))
      throw new Error('Invalid extension identifier');
    if (installing.has(id) || installing.size >= 4)
      return { result: 'install_in_progress' };
    const source = profiles.get(profileId)!;
    const destination = target();
    if (!destination?.owner || destination.owner.isDestroyed())
      return { result: 'user_cancelled' };
    if (
      destination.session.extensions.getExtension(id) &&
      read().some(
        (entry) => entry.id === id && extensionAllowed(entry, destination.id)
      )
    )
      return { result: 'success' };
    const sourceRevision = source.revision;
    const destinationRevision = destination.revision;
    const { owner } = destination;
    let expectedCatalogRevision = catalogRevision;
    const original = read().find((entry) => entry.id === id);
    let expectedEntry = JSON.stringify(original);
    let installActive = true;
    const cancellation = new AbortController();
    const request = watchIPCRequest(
      event,
      () =>
        installActive &&
        trusted(event) &&
        profiles.get(profileId) === source &&
        source.revision === sourceRevision &&
        target() === destination &&
        destination.revision === destinationRevision &&
        destination.owner === owner &&
        !owner.isDestroyed() &&
        catalogRevision === expectedCatalogRevision &&
        JSON.stringify(read().find((entry) => entry.id === id)) ===
          expectedEntry
    );
    installing.add(id);
    let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        installActive = false;
        cancellation.abort();
        reject(new Error('Extension installation timed out. Try again.'));
      }, 120000);
    });
    let prepared:
      | Awaited<ReturnType<typeof prepareExtensionPackage>>
      | undefined;
    let published: InstalledExtension | undefined;
    const loaded: Profile[] = [];
    const rollback = () => {
      for (const profile of loaded) {
        for (const extension of profile.session.extensions.getAllExtensions()) {
          if (extension.path === prepared?.path())
            profile.session.extensions.removeExtension(extension.id);
        }
      }
      if (
        published &&
        JSON.stringify(read().find((entry) => entry.id === id)) ===
          JSON.stringify(published)
      )
        save([
          ...read().filter((entry) => entry.id !== id),
          ...(original ? [original] : []),
        ]);
    };
    try {
      prepared = await Promise.race([
        prepareExtensionPackage(
          id,
          extensionFiles(),
          app.getPath('userData'),
          request.assert,
          original?.path
        ).then(async (value) => {
          if (!installActive) {
            await value.dispose();
            throw new Error('Extension installation stopped.');
          }
          return value;
        }),
        expired,
      ]);
      request.assert();
      const answer = await Promise.race([
        showBrowserDialog(owner, {
          signal: cancellation.signal,
          title: 'Install extension',
          message: `Install ${packageName(prepared)}?`,
          permissions: prepared.permissions,
          technicalDetail: `Extension: ${id}\nVersion: ${
            prepared.manifest.version
          }\n${prepared.permissions.join('\n')}`,
          detail: 'Each group keeps separate extension data.',
          scope: [
            { label: 'All groups, including future groups', response: 2 },
            {
              label: destination.name
                .replace(/(?: \(new session\))+$/g, '')
                .slice(0, 80),
              response: 1,
            },
          ],
          buttons: ['Cancel', 'Install extension', 'Install extension'],
          defaultId: 2,
          cancelId: 0,
        }),
        expired,
      ]);
      if (![1, 2].includes(answer.response) || !request.active())
        return { result: 'user_cancelled' };
      const packageToLoad = prepared;
      await queueMutation(async () => {
        try {
          request.assert();
          await packageToLoad.validate();
          request.assert();
          const packagePath = await packageToLoad.commit();
          request.assert();
          let policy: InstalledExtension;
          if (answer.response === 2) {
            policy = {
              id,
              path: packagePath,
              name: packageName(packageToLoad),
              enabled: true,
              scope: 'all',
              profiles: [destination.id],
              excluded: [],
            };
          } else if (original?.enabled) {
            policy = {
              ...original,
              path: packagePath,
              name: packageName(packageToLoad),
              profiles: [...new Set([...original.profiles, destination.id])],
              excluded: original.excluded.filter(
                (profile) => profile !== destination.id
              ),
            };
          } else {
            policy = {
              id,
              path: packagePath,
              name: packageName(packageToLoad),
              enabled: true,
              scope: 'selected',
              profiles: [destination.id],
              excluded: [],
            };
          }
          save([...read().filter((entry) => entry.id !== id), policy]);
          published = policy;
          expectedCatalogRevision = catalogRevision;
          expectedEntry = JSON.stringify(policy);
          const destinations =
            answer.response === 2
              ? [
                  destination,
                  ...getExtensionProfiles().filter(
                    (profile) => profile !== destination
                  ),
                ]
              : [destination];
          for (const profile of destinations) {
            request.assert();
            if (!profile.session.extensions.getExtension(id)) {
              // No await between authorization and the native load call.
              const load =
                profile.session.extensions.loadExtension(packagePath);
              loaded.push(profile);
              const extension = await load;
              if (extension.id !== id) {
                profile.session.extensions.removeExtension(extension.id);
                throw new Error('Loaded extension identity changed.');
              }
              request.assert();
              failures.delete(`${profile.id}:${id}`);
            }
          }
          packageToLoad.retain();
        } catch (error) {
          // Restore policy and native state before the next mutation dispatches.
          try {
            rollback();
          } catch (recoveryError) {
            // Do not delete a package that native recovery could still need.
            packageToLoad.retain();
            throw new Error(
              `${String(error)}; Recovery failed: ${String(recoveryError)}`
            );
          }
          throw error;
        }
      });
      if (request.active())
        event.senderFrame?.send('chrome.management.onInstalled', {
          id,
          name: packageName(prepared),
          shortName: packageName(prepared),
          version: prepared.manifest.version,
          enabled: true,
          type: 'extension',
          installType: 'normal',
          mayDisable: true,
          permissions: prepared.manifest.permissions || [],
          hostPermissions: prepared.manifest.host_permissions || [],
          icons: [],
        });
      return { result: 'success' };
    } catch (error) {
      failures.set(`${destination.id}:${id}`, String(error));
      // Failed packages may never enter the catalog, so their error cannot be
      // reached from an installed extension's menu. Keep technical details in
      // the trusted local dialog, rather than exposing paths to the store page.
      if (!owner.isDestroyed() && trusted(event)) {
        try {
          await showBrowserDialog(owner, {
            title: 'Install extension',
            message: 'Extension could not be installed',
            detail: 'Open Details below to see why installation failed.',
            technicalDetailLabel: 'Details',
            technicalDetail: `Extension: ${id}\n${String(error)}`,
            buttons: ['Done'],
          });
        } catch {
          // A closing window must not prevent rollback and package cleanup.
        }
      }
      return {
        result: 'install_error',
        message:
          'Extension could not be installed. Try again or review local extension settings.',
      };
    } finally {
      installActive = false;
      clearTimeout(timer!);
      request.dispose();
      installing.delete(id);
      try {
        await prepared?.dispose();
      } catch (error) {
        failures.set(`${destination.id}:${id}`, String(error));
      }
    }
  };
  contents.ipc.handle('chromeWebstore.beginInstall', install);
  storeInstallers.set(contents, { profileId, install });
  contents.ipc.handle(
    'chromeWebstore.getExtensionStatus',
    (event, id: string, manifestJson?: string | null) => {
      if (!trusted(event)) throw new Error('Untrusted extension store request');
      if (
        !validId(id) ||
        (manifestJson != null &&
          (typeof manifestJson !== 'string' ||
            Buffer.byteLength(manifestJson) > 1024 * 1024))
      )
        throw new Error('Invalid extension store request');
      const manifest =
        manifestJson == null ? undefined : JSON.parse(manifestJson);
      if (
        manifestJson != null &&
        (!manifest ||
          typeof manifest !== 'object' ||
          Array.isArray(manifest) ||
          !Number.isSafeInteger(manifest.manifest_version) ||
          manifest.manifest_version < 1)
      )
        throw new Error('Invalid extension manifest');
      const item = read().find((entry) => entry.id === id);
      const destination = target();
      if (
        item &&
        destination &&
        (profiles.get(profileId)?.installTarget === 'all'
          ? item.enabled && item.scope === 'all' && !item.excluded.length
          : extensionAllowed(item, destination.id))
      )
        return 'enabled';
      if (manifest && manifest.manifest_version < 3)
        return 'deprecated_manifest_version';
      return 'installable';
    }
  );
  contents.ipc.handle('chrome.management.getAll', (event) => {
    if (!trusted(event)) throw new Error('Untrusted extension store request');
    const destination = target();
    return (
      destination?.session.extensions.getAllExtensions().map((extension) => ({
        id: extension.id,
        name: extension.name,
        shortName: extension.name,
        enabled: true,
        version: extension.version,
        type: 'extension',
        installType: 'normal',
        mayDisable: true,
        description: extension.manifest.description || '',
        permissions: extension.manifest.permissions || [],
        hostPermissions: extension.manifest.host_permissions || [],
        icons: [],
      })) || []
    );
  });
  contents.ipc.handle(
    'chrome.management.uninstall',
    async (event, id: string) => {
      if (!trusted(event)) throw new Error('Untrusted extension store request');
      if (!validId(id)) throw new Error('Invalid extension store request');
      const item = read().find((entry) => entry.id === id);
      const destination = target();
      if (!item || !destination?.owner) return 'unknown_error';
      const requestingOwner = destination.owner;
      const source = profiles.get(profileId)!;
      const sourceRevision = source.revision;
      const destinationRevision = destination.revision;
      const snapshot = JSON.stringify(item);
      const approvedCatalogRevision = catalogRevision;
      const request = watchIPCRequest(
        event,
        () =>
          trusted(event) &&
          profiles.get(profileId) === source &&
          source.revision === sourceRevision &&
          target() === destination &&
          destination.revision === destinationRevision &&
          destination.owner === requestingOwner &&
          catalogRevision === approvedCatalogRevision &&
          !requestingOwner.isDestroyed() &&
          JSON.stringify(read().find((entry) => entry.id === id)) === snapshot
      );
      try {
        const answer = await showBrowserDialog(destination.owner, {
          message: `Remove ${item.name} from ${destination.name}?`,
          buttons: ['Cancel', 'Remove'],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response !== 1 || !request.active()) return 'user_cancelled';
        const operation = async () => {
          request.assert();
          save(
            read().map((entry) =>
              entry.id !== id
                ? entry
                : {
                    ...entry,
                    profiles: entry.profiles.filter(
                      (profile) => profile !== destination.id
                    ),
                    excluded: [...new Set([...entry.excluded, destination.id])],
                  }
            )
          );
          await reconcile();
          if (!contents.isDestroyed())
            contents.send('chrome.management.onUninstalled', id);
        };
        await queueMutation(operation);
        return 'success';
      } finally {
        request.dispose();
      }
    }
  );
}
export function storeExtensionId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://chromewebstore.google.com') return undefined;
    return /^\/detail\/(?:[^/]+\/)?([a-p]{32})\/?$/.exec(parsed.pathname)?.[1];
  } catch {
    return undefined;
  }
}

/** Native menu action reuses the same document-bound installer as store IPC. */
export async function installStoreExtension(
  contents: WebContents,
  owner: BrowserWindow
) {
  const registered = storeInstallers.get(contents);
  const profile = registered && profiles.get(registered.profileId);
  if (
    !registered ||
    contents.isDestroyed() ||
    owner.isDestroyed() ||
    profile?.owner !== owner ||
    profile.session !== contents.session
  )
    throw new Error('This extension store tab is no longer available.');
  const id = storeExtensionId(contents.getURL());
  if (!id || contents.mainFrame.origin !== 'https://chromewebstore.google.com')
    throw new Error('Open an extension detail page in the Chrome Web Store.');
  return registered.install(
    { sender: contents, senderFrame: contents.mainFrame } as IpcMainInvokeEvent,
    { id }
  );
}

/** UI metadata only; never expose installation paths to the workspace. */
export function extensionCatalog() {
  return read().map(({ id, name }) => ({ id, name }));
}

export function extensionMenu(
  owner: BrowserWindow,
  contents?: WebContents,
  extensionId?: string
): MenuItemConstructorOptions[] {
  const current =
    getExtensionProfile(active.get(owner.id) || '') ||
    getExtensionProfiles().find((profile) => profile.owner === owner);
  const items = read().filter(item => !extensionId || item.id === extensionId);
  const setPolicy = (id: string, patch: Partial<InstalledExtension>) =>
    change(async () => {
      save(
        read().map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
      await reconcile();
    }, owner);
  const toolbarOrder = toolbar.getOrder();
  const pinnedOrder = toolbarOrder ?? items.map((item) => item.id);
  const setToolbar = (order: string[] | null) =>
    change(async () => {
      toolbar.saveOrder(order);
    }, owner);
  const store = contents && storeInstallers.get(contents);
  const canInstall = Boolean(
    contents &&
      !contents.isDestroyed() &&
      store &&
      profiles.get(store.profileId)?.owner === owner &&
      storeExtensionId(contents.getURL())
  );
  const menu: MenuItemConstructorOptions[] = [
    ...(canInstall
      ? [
          {
            label: 'Install this extension…',
            click: async () => {
              try {
                await installStoreExtension(contents!, owner);
              } catch (error) {
                await showBrowserDialog(owner, {
                  title: 'Install extension',
                  message: 'Extension could not be installed',
                  detail:
                    'Try again or review the error details in extension settings.',
                  technicalDetail: String(error),
                  buttons: ['Done'],
                });
              }
            },
          },
          { type: 'separator' as const },
        ]
      : []),
    {
      label: 'Chrome Web Store…',
      enabled: Boolean(current),
      click: () => {
        if (current) change(() => openStore(current), owner);
      },
    },
    {
      label: nativeMenuLabels.openStoreForGroup,
      submenu: getExtensionProfiles().map((profile) => ({
        label: profile.name,
        click: () => change(() => openStore(profile), owner),
      })),
    },
    {
      label: nativeMenuLabels.checkForExtensionUpdates,
      click: () => change(updateInstalledExtensions, owner),
    },
    { label: 'Show all extension icons', click: () => setToolbar(null) },
    { type: 'separator' },
    ...items.map(
      (item): MenuItemConstructorOptions => ({
        label: item.name,
        submenu: [
          {
            label: 'Pin to toolbar',
            type: 'checkbox',
            checked: pinnedOrder.includes(item.id),
            click: () =>
              setToolbar(
                pinnedOrder.includes(item.id)
                  ? pinnedOrder.filter((id) => id !== item.id)
                  : [...pinnedOrder, item.id]
              ),
          },
          ...['Move icon earlier', 'Move icon later'].map(
            (label, direction) => ({
              label,
              enabled:
                pinnedOrder.includes(item.id) &&
                (direction === 0
                  ? pinnedOrder.indexOf(item.id) > 0
                  : pinnedOrder.indexOf(item.id) < pinnedOrder.length - 1),
              click: () => {
                const order = [...pinnedOrder];
                const index = order.indexOf(item.id);
                const target = index + (direction === 0 ? -1 : 1);
                if (index < 0 || target < 0 || target >= order.length) return;
                [order[index], order[target]] = [order[target], order[index]];
                setToolbar(order);
              },
            })
          ),
          { type: 'separator' },
          ...[...profiles.values()]
            .filter((profile) => failures.has(`${profile.id}:${item.id}`))
            .map((profile) => ({
              label: `View Errors in ${profile.name}…`,
              click: () =>
                showBrowserDialog(owner, {
                  message: `${item.name} · ${profile.name}`,
                  detail: 'This extension encountered an error in this group.',
                  technicalDetail:
                    failures.get(`${profile.id}:${item.id}`) ||
                    'Unknown extension error',
                  buttons: ['Done'],
                }),
            })),
          {
            label: item.enabled ? 'Disable extension' : 'Enable extension',
            click: () => setPolicy(item.id, { enabled: !item.enabled }),
          },
          {
            label: nativeMenuLabels.allGroupsIncludingNewGroups,
            type: 'checkbox',
            checked: item.scope === 'all',
            click: () =>
              setPolicy(item.id, {
                scope: item.scope === 'all' ? 'selected' : 'all',
                profiles: current ? [current.id] : [],
                excluded: [],
              }),
          },
          {
            label: nativeMenuLabels.groupAccess,
            submenu: getExtensionProfiles().map((profile) => ({
              label: profile.name,
              type: 'checkbox' as const,
              checked: extensionAllowed({ ...item, enabled: true }, profile.id),
              click: () => {
                if (item.scope === 'all')
                  setPolicy(item.id, {
                    excluded: item.excluded.includes(profile.id)
                      ? item.excluded.filter((id) => id !== profile.id)
                      : [...item.excluded, profile.id],
                  });
                else
                  setPolicy(item.id, {
                    profiles: item.profiles.includes(profile.id)
                      ? item.profiles.filter((id) => id !== profile.id)
                      : [...item.profiles, profile.id],
                  });
              },
            })),
          },
          {
            label: nativeMenuLabels.removeExtension,
            click: () =>
              change(async () => {
                const answer = await showBrowserDialog(owner, {
                  message: `Remove ${item.name} from all apps?`,
                  buttons: ['Cancel', 'Remove'],
                  defaultId: 0,
                  cancelId: 0,
                });
                if (answer.response !== 1) return;
                for (const profile of profiles.values()) {
                  const loaded = profile.session.extensions
                    .getAllExtensions()
                    .find((extension) => extension.id === item.id);
                  if (loaded)
                    profile.session.extensions.removeExtension(loaded.id);
                }
                save(read().filter((entry) => entry.id !== item.id));
              }, owner),
          },
        ],
      })
    ),
    ...(items.length
      ? []
      : [{ label: 'No extensions installed', enabled: false }]),
  ];
  return extensionId
    ? (menu.find(entry => entry.label === items[0]?.name)?.submenu as MenuItemConstructorOptions[] || [])
    : menu;
}
