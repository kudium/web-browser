/* eslint-disable no-use-before-define -- Markdown and plain-link parsing share validation. */
export const importBrowsers = [
  'Your default browser',
  'Arc',
  'Chrome',
  'Dia',
  'Edge',
  'Safari',
  'Firefox',
  'Other browser',
] as const;
export interface ImportedLink {
  name: string;
  url: string;
  folderPath?: string[];
  spaceName?: string;
  favorite?: boolean;
  pinned?: boolean;
}

function bookmarkFolderPath(link: Element) {
  const path: string[] = [];
  let node = link.parentElement;
  while (node) {
    if (node.tagName === 'DL') {
      const owner = node.parentElement;
      const sibling = node.previousElementSibling;
      const siblingHeading = sibling?.tagName === 'H3' ? sibling : undefined;
      const heading =
        (owner?.tagName === 'DT'
          ? Array.from(owner.children).find((child) => child.tagName === 'H3')
          : undefined) ||
        (sibling?.tagName === 'DT'
          ? sibling.querySelector('h3')
          : siblingHeading);
      if (heading?.textContent?.trim())
        path.unshift(heading.textContent.trim().slice(0, 128));
    }
    node = node.parentElement;
  }
  return path.slice(0, 20);
}
export function parseArcOutline(source: string): ImportedLink[] {
  const headings: { level: number; name: string }[] = [];
  const links: ImportedLink[] = [];
  let spaceLevel: number | undefined;
  source.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const name = heading[2]
        .trim()
        .replace(/^Space:\s*/i, '')
        .slice(0, 128);
      if (/^(?:Arc (?:Data )?Export|Spaces)$/i.test(name)) return;
      while (
        headings.length &&
        headings[headings.length - 1].level >= heading[1].length
      )
        headings.pop();
      headings.push({ level: heading[1].length, name });
      if (!/^(Favorites|Pinned tabs|Tabs|Today)$/i.test(name))
        spaceLevel = Math.min(spaceLevel || 7, heading[1].length);
      return;
    }
    const match =
      line.match(/\[([^\]]*)\]\((https?:\/\/[^\s]+)\)/) ||
      line.match(/(?:^|\s|<)(https?:\/\/[^\s>]+)>?\s*$/);
    if (!match) return;
    const raw = match.length === 3 ? match[2] : match[1];
    try {
      const parsed = parseBrowserLinks(raw, 'links')[0];
      const space = headings.find(
        (entry) =>
          entry.level === spaceLevel &&
          !/^(Favorites|Pinned tabs|Tabs|Today)$/i.test(entry.name)
      );
      const folders = headings
        .filter(
          (entry) =>
            entry !== space &&
            !/^(Favorites|Pinned tabs|Tabs|Today)$/i.test(entry.name)
        )
        .map((entry) => entry.name);
      const favorite = headings.some((entry) =>
        /^Favorites$/i.test(entry.name)
      );
      const pinned =
        favorite ||
        headings.some((entry) => /^Pinned tabs$/i.test(entry.name)) ||
        folders.length > 0;
      links.push({
        ...parsed,
        name:
          match.length === 3 && match[1].trim()
            ? match[1].trim().slice(0, 256)
            : parsed.name,
        spaceName: space?.name,
        folderPath: folders,
        favorite,
        pinned,
      });
    } catch {
      /* Ignore unsupported or invalid links. */
    }
  });
  if (!links.length) throw new Error('No web links found in this outline.');
  if (links.length > 500) throw new Error('Import up to 500 links at a time.');
  return links;
}

export function parseBrowserLinks(
  source: string,
  format: 'html' | 'links' | 'markdown'
): ImportedLink[] {
  if (source.length > 8 * 1024 * 1024)
    throw new Error('Choose a file smaller than 8 MB.');
  if (format === 'markdown') return parseArcOutline(source);
  const entries: ImportedLink[] =
    format === 'html'
      ? Array.from(
          new DOMParser()
            .parseFromString(source, 'text/html')
            .querySelectorAll('a[href]')
        ).map((link) => ({
          name: link.textContent || '',
          url: link.getAttribute('href') || '',
          folderPath: bookmarkFolderPath(link),
        }))
      : source
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((url) => ({ name: '', url: url.trim() }));
  const seen = new Set<string>();
  const links: ImportedLink[] = [];
  entries.forEach((entry) => {
    try {
      const url = new URL(entry.url);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        entry.url.length > 8192 ||
        seen.has(
          `${url.href}|${JSON.stringify(
            ('folderPath' in entry && entry.folderPath) || []
          )}`
        )
      )
        return;
      seen.add(
        `${url.href}|${JSON.stringify(
          ('folderPath' in entry && entry.folderPath) || []
        )}`
      );
      links.push({
        url: url.href,
        name: entry.name.trim().slice(0, 256) || url.hostname,
        ...('folderPath' in entry && entry.folderPath?.length
          ? { folderPath: entry.folderPath }
          : {}),
      });
    } catch {
      /* Ignore non-web links. */
    }
  });
  if (!links.length)
    throw new Error(
      'No web links found. Choose a bookmark HTML export or paste one http(s) link per line.'
    );
  if (links.length > 500)
    throw new Error(
      'Import up to 500 links at a time. Choose a smaller export.'
    );
  return links;
}
