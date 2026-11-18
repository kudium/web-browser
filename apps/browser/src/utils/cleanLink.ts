const trackingParameters = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid',
  'twclid', 'ttclid', 'yclid', '_ga', '_gl',
]);
const signedParameters = new Set([
  'signature', 'sig', 'hmac', 'oauth_signature', 'x-amz-signature', 'x-goog-signature',
]);

/** Remove known campaign parameters without rewriting the remaining URL bytes. */
export function cleanLink(value: string): string {
  try {
    if (!['https:', 'http:'].includes(new URL(value).protocol)) return value;
    const hash = value.indexOf('#');
    const end = hash < 0 ? value.length : hash;
    const query = value.indexOf('?');
    if (query < 0 || query >= end) return value;
    const parts = value.slice(query + 1, end).split('&');
    const name = (part: string) => {
      try { return decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')).toLowerCase(); }
      catch { return ''; }
    };
    // A signature may cover the entire query, including campaign fields.
    if (parts.some(part => signedParameters.has(name(part)))) return value;
    const kept = parts.filter(part => !/^utm_/.test(name(part)) && !trackingParameters.has(name(part)));
    if (kept.length === parts.length) return value;
    return value.slice(0, query) + (kept.length ? `?${kept.join('&')}` : '') + value.slice(end);
  } catch { return value; }
}
