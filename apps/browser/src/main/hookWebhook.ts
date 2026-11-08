import { BlockList, isIP } from 'net';
import { lookup } from 'dns/promises';
import { request } from 'https';

const privateNetworks = new BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([ip, bits]) =>
  privateNetworks.addSubnet(String(ip), Number(bits), 'ipv4')
);
const privateIPv6 = new BlockList();
[
  ['::', 96],
  ['2002::', 16],
  ['fec0::', 10],
  ['64:ff9b:1::', 48],
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([ip, bits]) =>
  privateIPv6.addSubnet(String(ip), Number(bits), 'ipv6')
);
export const publicWebhookAddress = (address: string) => {
  const family = isIP(address);
  return (
    !!family &&
    !(family === 4
      ? privateNetworks.check(address, 'ipv4')
      : privateIPv6.check(address, 'ipv6'))
  );
};
export function webhookURL(value: string) {
  if (typeof value !== 'string' || value.length > 4096)
    throw new Error('Save a valid HTTPS webhook URL.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Save a valid HTTPS webhook URL in the selected field.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    /(^|\.)(localhost|local)$/.test(url.hostname)
  )
    throw new Error(
      'Use a public HTTPS webhook without credentials or a custom port.'
    );
  return url;
}
async function resolveWebhook(host: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (isIP(host)) return [{ address: host, family: isIP(host) }];
  return new Promise<Array<{ address: string; family: number }>>(
    (resolve, reject) => {
      const abort = () => reject(new Error('Cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      lookup(host, { all: true, verbatim: true })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort))
        .catch(reject);
    }
  );
}
/**
 * No redirects, private networks, credential-bearing errors, or response bodies
 * escape.
 */
export async function deliverHookWebhook(
  endpoint: string,
  recipient: string | undefined,
  text: string,
  signal: AbortSignal
) {
  const url = webhookURL(endpoint);
  const deliverySignal = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  try {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await resolveWebhook(host, deliverySignal);
    deliverySignal.throwIfAborted();
    if (
      !addresses.length ||
      addresses.some((item) => !publicWebhookAddress(item.address))
    )
      throw new Error(
        'Webhook destination must resolve only to public addresses.'
      );
    const telegram = url.hostname === 'api.telegram.org';
    if (
      telegram &&
      (!/^\/bot[^/]+\/sendMessage$/.test(url.pathname) || !recipient)
    )
      throw new Error(
        'Telegram needs a sendMessage URL and a saved chat ID field.'
      );
    const body = JSON.stringify(
      telegram
        ? { chat_id: recipient, text, disable_web_page_preview: true }
        : { text }
    );
    const pinned = addresses[0];
    await new Promise<void>((resolve, reject) => {
      const outgoing = request(
        url,
        {
          method: 'POST',
          signal: deliverySignal,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          lookup: (_host, options, callback) => {
            if (options.all)
              callback(null, [
                { address: pinned.address, family: pinned.family },
              ]);
            else callback(null, pinned.address, pinned.family);
          },
        },
        (response) => {
          let responseBody = '';
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 4096) outgoing.destroy(new Error('Response too large'));
            else responseBody += chunk.toString();
          });
          response.on('error', reject);
          response.on('end', () => {
            if (
              !response.statusCode ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              reject(new Error('Delivery rejected'));
              return;
            }
            if (telegram) {
              try {
                if (JSON.parse(responseBody).ok !== true) throw new Error();
              } catch {
                reject(new Error('Telegram rejected delivery'));
                return;
              }
            }
            resolve();
          });
        }
      );
      outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Timeout')));
      outgoing.on('error', reject);
      outgoing.end(body);
    });
    return { accepted: true };
  } catch {
    throw new Error(
      'Notification delivery failed. Check the saved destination and try again.'
    );
  }
}
