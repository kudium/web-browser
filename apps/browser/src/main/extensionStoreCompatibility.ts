import type { WebContents } from 'electron';
import { addRequestHeaderRule } from './requestHeaderRules';

const registered = new WeakSet<WebContents>();

/** Store compatibility branding retains the real engine version. */
export function applyExtensionStoreClientHint(
  url: string,
  headers: Record<string, string>,
  chromiumVersion: string
) {
  try {
    if (new URL(url).origin !== 'https://chromewebstore.google.com') return;
  } catch {
    return;
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(chromiumVersion)) return;
  const userAgent = Object.keys(headers).find(
    (name) => name.toLowerCase() === 'user-agent'
  );
  // Respect explicit user-agent overrides, including non-Chromium identities.
  if (userAgent && !headers[userAgent].includes(`Chrome/${chromiumVersion}`))
    return;
  const names = Object.keys(headers).filter(
    (name) => name.toLowerCase() === 'sec-ch-ua'
  );
  const major = chromiumVersion.split('.')[0];
  const original = names.length ? headers[names[0]] : `"Chromium";v="${major}"`;
  if (original.includes('"Google Chrome"')) return;
  names.forEach((name) => delete headers[name]);
  headers['Sec-CH-UA'] = `${original}, "Google Chrome";v="${major}"`;
}

/** Only registered store tabs receive the store's Chrome compatibility hint. */
export function configureExtensionStoreCompatibility(contents: WebContents) {
  if (registered.has(contents)) return;
  if (!contents.session.webRequest?.onBeforeSendHeaders) return;
  registered.add(contents);
  const remove = addRequestHeaderRule(
    contents.session,
    (details, headers) => {
      if (details.webContentsId !== contents.id || contents.isDestroyed())
        return;
      if (
        details.resourceType !== 'mainFrame' &&
        contents.mainFrame?.origin !== 'https://chromewebstore.google.com'
      )
        return;
      applyExtensionStoreClientHint(
        details.url,
        headers,
        process.versions.chrome
      );
    },
    100
  );
  contents.once('destroyed', remove);
}
