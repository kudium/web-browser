import {
  defaultSearchEngines,
  validateSearchEngines,
} from '../browser/searchEngines';
import { IApp } from '../types';

export function cachedSearchEngines() {
  try {
    const saved = localStorage.getItem('kudiumbrowser-search-engines');
    if (saved) return validateSearchEngines(JSON.parse(saved));
  } catch {
    /* Built-in engines remain available while preferences load. */
  }
  return defaultSearchEngines;
}

export function resolveAddress(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Enter a website or search term.');
  const address = /^(https?:\/\/|localhost[:/]|[\w-]+\.[\w.-]+)/i.test(input);
  if (!address) {
    const engines = cachedSearchEngines();
    const engine =
      engines.find(
        (entry) => entry.id === localStorage.getItem('kudiumbrowser-search-engine')
      ) || engines[0];
    return engine.url.replaceAll('%s', encodeURIComponent(input));
  }
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error('Use HTTP or HTTPS.');
  return url.href;
}

export function sharesOrigin(source: IApp | undefined, url: string): boolean {
  try {
    return Boolean(
      source && new URL(source.url).origin === new URL(url).origin
    );
  } catch {
    return false;
  }
}
