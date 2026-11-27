export interface TodoLink {
  href: string;
  label: string;
  kind: 'web' | 'email' | 'phone';
}
function destination(value: string): Omit<TodoLink, 'label'> | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    if (['http:', 'https:'].includes(url.protocol))
      return { href: url.href, kind: 'web' };
    if (
      url.protocol === 'mailto:' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname) &&
      !/%0[ad]/i.test(url.href)
    )
      return { href: url.href, kind: 'email' };
    if (url.protocol === 'tel:' && /^\+?[\d(). -]+$/.test(url.pathname)) {
      const number = url.pathname.replace(/[^\d+]/g, '');
      if (/^\+?\d{7,15}$/.test(number))
        return { href: `tel:${number}`, kind: 'phone' };
    }
  } catch {
    /* Non-link text stays plain. */
  }
  return undefined;
}
/** Parse only the visible task, without loading targets or resolving domains. */
export function todoLinks(text: string): TodoLink[] {
  const links: (TodoLink & { index: number })[] = [];
  const occupied: [number, number][] = [];
  const add = (
    value: string,
    index: number,
    length: number,
    label?: string,
  ) => {
    const link = destination(value);
    if (!link) return;
    const before = (
      text.slice(0, index).split(/[\n;]/).at(-1) || ''
    ).trimStart();
    const named = before
      .match(/(?:^|[.!?]\s+)([\p{L}][\p{L}\p{N} _-]{0,49})\s*:\s*$/u)?.[1]
      ?.trim();
    const display =
      label ||
      named ||
      (link.kind === 'email'
        ? 'Email'
        : link.kind === 'phone'
          ? 'Call'
          : new URL(link.href).hostname.replace(/^www\./, ''));
    links.push({ ...link, label: display, index });
    occupied.push([index, index + length]);
  };
  for (const match of text.matchAll(
    /\[([^\]\n]{1,80})\]\(([^\s)]{1,500})\)/g,
  )) {
    occupied.push([match.index!, match.index! + match[0].length]);
    add(match[2], match.index!, match[0].length, match[1]);
  }
  const patterns: [RegExp, (value: string) => string][] = [
    [
      /\b(?:https?:\/\/|www\.)[^\s<>]+/gi,
      (value) => (/^www\./i.test(value) ? `https://${value}` : value),
    ],
    [/\bmailto:[^\s<>]+/gi, (value) => value],
    [
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi,
      (value) => `mailto:${value}`,
    ],
    [
      /\b(?:[a-z0-9][a-z0-9-]*\.)+(?:com|org|net|io|dev|app|co|edu|gov|ca|uk|ai|me|info|biz)(?:\/[^\s<>]*)?\b/gi,
      (value) => `https://${value}`,
    ],
    [/\btel:\+?[\d(). -]+\d/gi, (value) => value],
    [
      /(?<![\w\d])(?:\+\d|\(\d|\d)[\d(). -]{5,22}\d(?!\w)/g,
      (value) => `tel:${value}`,
    ],
  ];
  for (const [pattern, normalize] of patterns)
    for (const match of text.matchAll(pattern)) {
      const index = match.index!;
      if (occupied.some(([start, end]) => index >= start && index < end))
        continue;
      const value = match[0].trim().replace(/[.,;!?)]+$/, '');
      if (
        normalize(value).startsWith('tel:') &&
        !value.toLowerCase().startsWith('tel:')
      ) {
        if (
          /^\d{4}-\d{2}-\d{2}(?:\b|$)/.test(value) ||
          /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)
        )
          continue;
        const prefix = text.slice(0, index);
        if (
          !value.startsWith('+') &&
          !/[() -]/.test(value) &&
          !/^\d{10,15}$/.test(value) &&
          !/(?:phone|tel|mobile|call)\s*:\s*$/i.test(prefix)
        )
          continue;
      }
      occupied.push([index, index + match[0].length]);
      add(normalize(value), index, match[0].length);
    }
  const seen = new Set<string>();
  return links
    .sort((a, b) => a.index - b.index)
    .filter((link) => {
      if (seen.has(link.href)) return false;
      seen.add(link.href);
      return true;
    })
    .map(({ index, ...link }) => link);
}
