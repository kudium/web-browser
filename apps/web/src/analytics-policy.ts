import { createRequire } from 'node:module';
import { isIP } from 'node:net';

const { lookup } = createRequire(import.meta.url)('geoip-country') as {
  lookup(ip: string): { country: string } | null;
};

// Google's European consent policy covers the EEA, UK and Switzerland.
const optInCountries = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH',
]);

export function countryRequiresConsent(country?: string | null) {
  return typeof country === 'string' && optInCountries.has(country);
}

function normalize(ip: string) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function analyticsConsentRequired(peer?: string, forwardedFor?: string) {
  if (!peer) return false;
  peer = normalize(peer);
  // Trust the last address appended by our internal reverse proxy, never a
  // client-supplied country header or the first, spoofable X-Forwarded-For entry.
  const internalProxy = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(peer) ||
    peer === '::1' || /^(fc|fd|fe80:)/i.test(peer);
  const candidate = internalProxy && forwardedFor && forwardedFor.length <= 4096
    ? normalize(forwardedFor.split(',').at(-1)!.trim()) : peer;
  if (!isIP(candidate)) return false;
  try { return countryRequiresConsent(lookup(candidate)?.country); }
  catch { return false; }
}
