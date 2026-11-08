import { lookup } from 'dns/promises';
import { request } from 'https';
import { publicWebhookAddress } from './hookWebhook';
import { skillFromText } from './aiSkills';

export function skillLinkURL(value: unknown) {
  if (typeof value !== 'string' || value.length > 4096)
    throw new Error('Enter a SKILL.md link.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid SKILL.md link.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('Use a public HTTPS link without credentials.');
  url.hash = '';
  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2)
      return new URL(
        `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/HEAD/SKILL.md`
      );
    if (parts.length >= 4 && ['blob', 'tree'].includes(parts[2])) {
      const suffix = parts[2] === 'tree' ? '/SKILL.md' : '';
      return new URL(
        `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts
          .slice(3)
          .join('/')}${suffix}`
      );
    }
  }
  return url;
}

export async function loadSkillLink(value: unknown, signal: AbortSignal) {
  const url = skillLinkURL(value);
  const addresses = await new Promise<
    Array<{ address: string; family: number }>
  >((resolve, reject) => {
    const abort = () =>
      reject(new Error('Skill download timed out. Try again.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    lookup(url.hostname, { all: true, verbatim: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => {});
  });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some((entry) => !publicWebhookAddress(entry.address))
  )
    throw new Error('Skill links must point to a public website.');
  const pinned = addresses[0];
  const source = await new Promise<string>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: 'GET',
        signal,
        headers: {
          Accept: 'text/plain, text/markdown',
          'Accept-Encoding': 'identity',
        },
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          /text\/html/i.test(response.headers['content-type'] || '')
        ) {
          response.destroy();
          reject(
            new Error(
              'Could not download the skill. Use a direct SKILL.md link.'
            )
          );
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > 65536) {
            outgoing.destroy(
              new Error('Skill files must be smaller than 64 KB.')
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (length > 65536)
            reject(new Error('Skill files must be smaller than 64 KB.'));
          else resolve(Buffer.concat(chunks).toString('utf8'));
        });
        response.on('error', reject);
      }
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
  signal.throwIfAborted();
  return skillFromText(source);
}
