/** Store domain exclusions locally, including subdomains on a label boundary. */
export function normalizeSleepSites(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('Keep up to 100 website exclusions.');
  return [
    ...new Set(
      value.map((entry) => {
        if (typeof entry !== 'string' || !entry.trim() || entry.length > 2048)
          throw new Error('Enter a website domain or HTTP/HTTPS address.');
        let url: URL;
        try {
          url = new URL(
            entry.includes('://') ? entry.trim() : `https://${entry.trim()}`
          );
        } catch {
          throw new Error('Enter a valid website domain or address.');
        }
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          !url.hostname ||
          url.hostname.includes('*')
        )
          throw new Error('Use HTTP/HTTPS websites without login credentials.');
        return url.hostname.toLowerCase().replace(/\.$/, '');
      })
    ),
  ];
}
export function excludedFromSleep(url: string, sites: string[] = []): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return sites.some(
      (site) => hostname === site || hostname.endsWith(`.${site}`)
    );
  } catch {
    return true;
  }
}
