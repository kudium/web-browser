/* eslint-disable no-restricted-syntax, no-await-in-loop */
import {
  app,
  WebContents,
  webContents,
  Session,
  session,
  BrowserWindow,
  dialog,
} from 'electron';
import fs from 'fs';
import path from 'path';
import { getDomain } from 'tldts';
import {
  AdvancedPreferences,
  defaultAdvanced,
  dnsProviders,
  siteRule,
} from '../browser/advancedPreferences';
import { browserUserAgent } from './browserIdentity';
import { addRequestRule } from './requestRules';
import { clearSessionSiteData } from './siteData';
import { flushHistory, hasPendingHistory, setHistoryQuitting } from './history';

const profiles = new Map<Session, string>();
const configurations = new WeakMap<Session, AdvancedPreferences>();
const pending = new WeakMap<Session, Promise<void>>();
const proxyKeys = new WeakMap<Session, string>();
const attached = new WeakSet<Session>();
const registered = new WeakSet<WebContents>();
const originalIdentities = new WeakMap<Session, string>();
const originalLanguages = new WeakMap<Session, string>();
const networkErrors = new WeakMap<Session, string>();
let dnsKey = '';
let current = defaultAdvanced;
export function configureDNS(preferences: AdvancedPreferences) {
  current = preferences;
  let servers: string[] = [];
  if (preferences.dnsProvider === 'custom') servers = [preferences.dnsEndpoint];
  else if (preferences.dnsProvider !== 'system')
    servers = [dnsProviders[preferences.dnsProvider]];
  const key = JSON.stringify([preferences.dnsMode, servers]);
  if (key !== dnsKey) {
    app.configureHostResolver?.({
      secureDnsMode: preferences.dnsMode,
      secureDnsServers: servers,
      enableBuiltInResolver: true,
    });
    dnsKey = key;
  }
}
export function contentPreferences(
  preferences: AdvancedPreferences,
  url: string
) {
  const rule = siteRule(preferences, url);
  return {
    javascript: rule?.javascript ?? preferences.javascript,
    images: rule?.images ?? preferences.images,
    autoplayPolicy:
      rule?.autoplay ?? preferences.autoplay
        ? ('no-user-gesture-required' as const)
        : ('document-user-activation-required' as const),
  };
}
function origin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
export function thirdParty(requestURL: string, topURL: string): boolean {
  try {
    const request = new URL(requestURL);
    const page = new URL(topURL);
    const requestSite =
      getDomain(request.hostname, { allowPrivateDomains: true }) ||
      request.hostname;
    const pageSite =
      getDomain(page.hostname, { allowPrivateDomains: true }) || page.hostname;
    return request.protocol !== page.protocol || requestSite !== pageSite;
  } catch {
    return false;
  }
}
const basicTrackers = [
  'doubleclick.net',
  'google-analytics.com',
  'googlesyndication.com',
  'connect.facebook.net',
  'analytics.tiktok.com',
];
export function blockedTracker(url: string) {
  try {
    const host = new URL(url).hostname;
    return basicTrackers.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}
function pageURL(details: {
  webContentsId?: number;
  url: string;
  resourceType: string;
  referrer?: string;
}) {
  if (details.resourceType === 'mainFrame') return details.url;
  return (
    webContents.fromId?.(details.webContentsId ?? -1)?.getURL() ||
    details.referrer ||
    ''
  );
}
function cookieBlocked(
  preferences: AdvancedPreferences,
  url: string,
  page: string
) {
  if (preferences.cookieExceptions.includes(origin(page))) return false;
  return (
    preferences.cookies === 'block-all-http' ||
    (preferences.cookies === 'block-third-party-http' && thirdParty(url, page))
  );
}
function identity(
  preferences: AdvancedPreferences,
  profile: string,
  page: string,
  fallback: string
) {
  return (
    siteRule(preferences, page)?.userAgent ||
    preferences.profileUserAgents[profile] ||
    preferences.userAgent ||
    fallback
  );
}
export function applyAdvancedContents(
  contents: WebContents,
  preferences: AdvancedPreferences,
  profile = ''
) {
  if (contents.isDestroyed()) return;
  const target = contents.session;
  profiles.set(target, profile || profiles.get(target) || '');
  configurations.set(target, preferences);
  if (!originalIdentities.has(target))
    originalIdentities.set(
      target,
      browserUserAgent(contents.getUserAgent?.() || app.userAgentFallback || '')
    );
  if (!originalLanguages.has(target))
    originalLanguages.set(
      target,
      app.getPreferredSystemLanguages?.().join(',') || 'en-US,en'
    );
  const fallback = originalIdentities.get(target)!;
  const profileId = profiles.get(target)!;
  const ua = identity(preferences, profileId, contents.getURL(), fallback);
  target.setUserAgent?.(
    preferences.profileUserAgents[profileId] ||
      preferences.userAgent ||
      fallback,
    preferences.acceptLanguages || originalLanguages.get(target)
  );
  contents.setUserAgent?.(ua);
  contents.setWebRTCIPHandlingPolicy?.(preferences.webrtc);
  contents.setBackgroundThrottling?.(preferences.energySaver);
  const initialRule = siteRule(preferences, contents.getURL());
  if (initialRule) contents.setZoomFactor(initialRule.zoom);
  const proxy = preferences.profileProxies[profileId] || preferences.proxy;
  const proxyKey = JSON.stringify(proxy);
  if (proxyKeys.get(target) !== proxyKey && target.setProxy) {
    proxyKeys.set(target, proxyKey);
    const previous = pending.get(target) || Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        await target.setProxy({
          mode: proxy.mode,
          proxyRules: proxy.rules,
          pacScript: proxy.pacURL,
          proxyBypassRules: proxy.bypass,
        });
        await target.closeAllConnections();
        networkErrors.delete(target);
        return undefined;
      })
      .catch((error) => {
        networkErrors.set(target, String(error));
        proxyKeys.delete(target);
      });
    pending.set(target, operation);
  }
  if (!registered.has(contents)) {
    registered.add(contents);
    contents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) {
        const settings = configurations.get(target)!;
        contents.setUserAgent(
          identity(settings, profiles.get(target)!, url, fallback)
        );
      }
    });
    contents.on('did-navigate', () => {
      const settings = configurations.get(target)!;
      const saved = siteRule(settings, contents.getURL());
      if (saved) contents.setZoomFactor(saved.zoom);
    });
  }
  if (!attached.has(target) && target.webRequest) {
    attached.add(target);
    // These native hooks coexist with Chromium extension request listeners.
    addRequestRule(target, (details) => {
      const settings = configurations.get(target)!;
      const page = pageURL(details);
      const rule = siteRule(settings, page);
      const block =
        ((rule?.javascript ?? settings.javascript) === false &&
          details.resourceType === 'script') ||
        ((rule?.images ?? settings.images) === false &&
          details.resourceType === 'image') ||
        (settings.trackingProtection &&
          !settings.trackingExceptions.includes(origin(page)) &&
          details.resourceType !== 'mainFrame' &&
          blockedTracker(details.url));
      return block;
    });
    target.webRequest.onBeforeSendHeaders(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        const settings = configurations.get(target)!;
        const page = pageURL(details);
        const headers = { ...details.requestHeaders };
        Object.keys(headers).forEach((name) => {
          if (
            name.toLowerCase() === 'cookie' &&
            cookieBlocked(settings, details.url, page)
          )
            delete headers[name];
          if (
            name.toLowerCase() === 'referer' &&
            settings.referrer !== 'default'
          ) {
            if (settings.referrer === 'none') delete headers[name];
            else {
              try {
                headers[name] = `${new URL(headers[name]).origin}/`;
              } catch {
                delete headers[name];
              }
            }
          }
        });
        headers['User-Agent'] = identity(
          settings,
          profiles.get(target)!,
          page,
          fallback
        );
        if (settings.acceptLanguages)
          headers['Accept-Language'] = settings.acceptLanguages;
        callback({ requestHeaders: headers });
      }
    );
    target.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        const headers = { ...details.responseHeaders };
        const settings = configurations.get(target)!;
        const rule = siteRule(settings, pageURL(details));
        if (
          details.resourceType === 'mainFrame' ||
          details.resourceType === 'subFrame'
        ) {
          const policies = [];
          if (!(rule?.javascript ?? settings.javascript))
            policies.push("script-src 'none'");
          if (!(rule?.images ?? settings.images))
            policies.push("img-src 'none'");
          if (policies.length) {
            const name =
              Object.keys(headers).find(
                (key) => key.toLowerCase() === 'content-security-policy'
              ) || 'Content-Security-Policy';
            headers[name] = [...(headers[name] || []), policies.join('; ')];
          }
        }
        if (
          cookieBlocked(
            configurations.get(target)!,
            details.url,
            pageURL(details)
          )
        )
          Object.keys(headers).forEach((name) => {
            if (name.toLowerCase() === 'set-cookie') delete headers[name];
          });
        callback({ responseHeaders: headers });
      }
    );
  }
}
export async function waitForBrowserNetwork(contents: WebContents) {
  await pending.get(contents.session);
  const error = networkErrors.get(contents.session);
  if (error) throw new Error(`Proxy configuration failed: ${error}`);
}
export function registerAdvancedLifecycle() {
  let quitting = false;
  let ready = false;
  app.on('before-quit', (event) => {
    if (quitting) {
      if (!ready) event.preventDefault();
      return;
    }
    if (!current.clearOnExit && !hasPendingHistory()) return;
    event.preventDefault();
    quitting = true;
    setHistoryQuitting(true);
    const targets = new Set(current.clearOnExit ? profiles.keys() : []);
    const directory = path.join(app.getPath('sessionData'), 'Partitions');
    try {
      (current.clearOnExit ? fs.readdirSync(directory) : [])
        .filter((name) => name.startsWith('kudiumbrowser-'))
        .forEach((name) =>
          targets.add(session.fromPartition(`persist:${name}`))
        );
    } catch {
      /* No persistent profiles yet. */
    }
    Promise.allSettled([
      flushHistory(),
      ...[...targets].map((target) => clearSessionSiteData(target)),
    ])
      .then((results) => {
        const failed = results.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
        ready = true;
        app.quit();
        return undefined;
      })
      .catch((error) => {
        quitting = false;
        setHistoryQuitting(false);
        dialog.showErrorBox(
          'Could not finish quitting',
          `Kudium Browser has stayed open. Retry quitting after resolving the storage error.\n${String(
            error
          )}`
        );
      });
  });
}
export async function advancedDiagnostic(
  action: string,
  target: Session | undefined,
  owner: BrowserWindow
) {
  if (action === 'performance-info')
    return {
      kind: 'diagnostic',
      text: JSON.stringify(
        {
          gpu: app.getGPUFeatureStatus(),
          processes: app.getAppMetrics().map((item) => ({
            type: item.type,
            cpu: item.cpu.percentCPUUsage,
            memoryKB: item.memory.workingSetSize,
          })),
        },
        null,
        2
      ),
    };
  if (!target) throw new Error('Choose an available browser session.');
  if (action === 'network-test') {
    const started = Date.now();
    await pending.get(target);
    if (networkErrors.has(target)) throw new Error(networkErrors.get(target));
    const resolvedProxy = await target.resolveProxy('https://example.com');
    const response = await target.fetch('https://example.com', {
      signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    return {
      kind: 'diagnostic',
      text: JSON.stringify(
        {
          status: response.status,
          elapsedMs: Date.now() - started,
          effectiveProxy: resolvedProxy,
          dnsMode: current.dnsMode,
          dnsProvider: current.dnsProvider,
          note: 'Tests an HTTPS request through this session. PAC decisions can differ by destination; DNS settings do not prove which resolver handled this request.',
        },
        null,
        2
      ),
    };
  }
  if (action === 'network-log-start') {
    if (target.netLog.currentlyLogging)
      throw new Error('This session is already logging.');
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: path.join(app.getPath('downloads'), 'kudiumbrowser-network.json'),
      filters: [{ name: 'JSON network log', extensions: ['json'] }],
      title: 'Save network log (contains visited URLs)',
    });
    if (!result.canceled && result.filePath)
      await target.netLog.startLogging(result.filePath, {
        captureMode: 'default',
      });
    return {
      kind: 'diagnostic',
      text: result.canceled
        ? 'Cancelled.'
        : 'Logging started. Reproduce the issue, then stop logging.',
    };
  }
  if (action === 'network-log-stop') {
    await target.netLog.stopLogging();
    return { kind: 'diagnostic', text: 'Network log saved.' };
  }
  if (action === 'storage-info')
    return {
      kind: 'diagnostic',
      text: JSON.stringify(
        {
          httpCacheBytes: await target.getCacheSize(),
          cookies: (await target.cookies.get({})).length,
          note: 'Cookie count and HTTP cache usage. Local storage and IndexedDB size are not included.',
        },
        null,
        2
      ),
    };
  throw new Error('Unknown diagnostic');
}
