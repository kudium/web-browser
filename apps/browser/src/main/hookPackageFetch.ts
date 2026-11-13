/* Shared portable source contract; both apps build this module directly. */
/* eslint-disable import/no-relative-packages */
import { lookup } from 'dns/promises';
import { request } from 'https';
import { isIP } from 'net';
import { createHash } from 'crypto';
import {
  parseHookPackage,
  browserSupportsPackage,
} from '../../../../packages/hooks/package';
import { publicWebhookAddress } from './hookWebhook';

export const hookPackageHash = (pkg: unknown) =>
  createHash('sha256').update(JSON.stringify(pkg)).digest('hex');
export function hookPackageURL(value: string) {
  if (typeof value !== 'string' || value.length > 4096)
    throw new Error('Enter a public HTTPS package URL.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid hook package URL.');
  }
  if (url.protocol === 'kudium:' && url.hostname === 'install-hook')
    return hookPackageURL(url.searchParams.get('url') || '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    /(^|\.)(localhost|local)$/.test(url.hostname)
  )
    throw new Error(
      'Use a public HTTPS URL without credentials or a custom port.'
    );
  return url;
}
export async function fetchHookPackage(value: string, browserVersion: string) {
  const initial = hookPackageURL(value);
  const signal = AbortSignal.timeout(15000);
  const load = async (
    url: URL,
    redirects: number
  ): Promise<{ data: unknown; url: URL }> => {
    signal.throwIfAborted();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await Promise.race([
      isIP(host)
        ? Promise.resolve([{ address: host, family: isIP(host) }])
        : lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(new Error('Package request timed out.'));
        else
          signal.addEventListener(
            'abort',
            () => reject(new Error('Package request timed out.')),
            { once: true }
          );
      }),
    ]);
    signal.throwIfAborted();
    if (
      !addresses.length ||
      addresses.some((ip) => !publicWebhookAddress(ip.address))
    )
      throw new Error(
        'Hook URLs must resolve only to public network addresses.'
      );
    const pinned = addresses[0];
    const result = await new Promise<{ redirect?: string; data?: unknown }>(
      (resolve, reject) => {
        const outgoing = request(
          url,
          {
            method: 'GET',
            signal,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Kudium hook installer',
            },
            lookup: (_host, options, callback) => {
              if (options.all) callback(null, [pinned]);
              else callback(null, pinned.address, pinned.family);
            },
          },
          (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
              response.resume();
              if (!response.headers.location)
                reject(new Error('Invalid package redirect.'));
              else resolve({ redirect: response.headers.location });
              return;
            }
            if (response.statusCode !== 200) {
              response.resume();
              reject(new Error('Hook package is unavailable.'));
              return;
            }
            if (
              !/^application\/(json|[a-z0-9.+-]+\+json)(;|$)/i.test(
                response.headers['content-type'] || ''
              )
            ) {
              response.resume();
              reject(new Error('The URL must return a JSON hook package.'));
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            response.on('data', (chunk) => {
              size += chunk.length;
              if (size > 256 * 1024)
                outgoing.destroy(new Error('Hook package exceeds 256 KiB.'));
              else chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => {
              try {
                resolve({
                  data: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                });
              } catch {
                reject(new Error('Invalid JSON package.'));
              }
            });
          }
        );
        outgoing.setTimeout(15000, () =>
          outgoing.destroy(new Error('Package request timed out.'))
        );
        outgoing.on('error', reject);
        outgoing.end();
      }
    );
    if (result.redirect) {
      if (redirects >= 3) throw new Error('Too many package redirects.');
      return load(
        hookPackageURL(new URL(result.redirect, url).href),
        redirects + 1
      );
    }
    return { data: result.data, url };
  };
  const response = await load(initial, 0);
  const envelope = response.data as any;
  const pkg = parseHookPackage(envelope?.package || envelope);
  if (!browserSupportsPackage(pkg, browserVersion))
    throw new Error(
      `This hook requires Kudium ${pkg.minimumBrowserVersion} or later.`
    );
  const hash = hookPackageHash(pkg);
  const verified =
    response.url.origin === 'https://browser.kudium.com' &&
    /^\/v1\/hooks\/[^/]+\/(?:versions\/\d+\/)?package$/.test(
      response.url.pathname
    );
  let publication;
  if (verified) {
    if (
      typeof envelope.id !== 'string' ||
      !Number.isSafeInteger(envelope.version) ||
      envelope.version < 1 ||
      typeof envelope.publisher?.id !== 'string' ||
      typeof envelope.publisher?.name !== 'string' ||
      envelope.contentHash !== hash
    )
      throw new Error('Invalid marketplace package metadata.');
    publication = {
      id: envelope.id,
      version: envelope.version,
      publisher: { id: envelope.publisher.id, name: envelope.publisher.name },
      contentHash: hash,
    };
  }
  return { source: response.url.href, package: pkg, verified, publication };
}
