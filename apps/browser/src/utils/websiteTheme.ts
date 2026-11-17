import type { CSSProperties } from 'react';

/** Apply only normalized colors; never accept arbitrary CSS from pages. */
export function websiteThemeStyle(color?: string): CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return { '--website-color': color } as CSSProperties;
}

/**
 * Extract a website's primary color from the current document: matching
 * theme-color metadata first, then a visible header band. Returns normalized
 * opaque sRGB hex, or undefined so the caller can use its own default.
 * Self-contained for serialization into a website's main frame; no host rules.
 */
export function extractWebsitePrimaryColor(): string | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  const color = (value: string | null) => {
    if (!value || !context || !CSS.supports('color', value)) return undefined;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    if (alpha !== 255) return undefined;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  };
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color" i]')) {
    if (meta.media && !matchMedia(meta.media).matches) continue;
    const resolved = color(meta.content);
    if (resolved) return resolved;
  }
  const semantic = Array.from(document.querySelectorAll<HTMLElement>('header,[role="banner"],nav'));
  const sampled = new Set<HTMLElement>();
  // Many websites build their header from divs. Sample the top of the viewport
  // and inspect wide ancestors, without relying on class names or domains.
  for (const y of [24, 56, 96]) {
    if (y >= innerHeight) continue;
    for (const fraction of [0.2, 0.5, 0.8]) {
      for (const hit of document.elementsFromPoint(innerWidth * fraction, y)) {
        let element: HTMLElement | null = hit instanceof HTMLElement ? hit : hit.parentElement;
        for (let depth = 0; element && depth < 6; depth++, element = element.parentElement) {
          if (element === document.body || element === document.documentElement) break;
          if (element.getBoundingClientRect().height <= Math.min(320, innerHeight / 2)) sampled.add(element);
        }
      }
    }
  }
  const candidates = [...new Set([...semantic, ...sampled])].sort((a, b) =>
    a.getBoundingClientRect().top - b.getBoundingClientRect().top ||
    Number(!semantic.includes(a)) - Number(!semantic.includes(b)));
  for (const header of candidates) {
    const rect = header.getBoundingClientRect();
    if (rect.width < innerWidth / 2 || rect.height < 24 || rect.bottom <= 0 || rect.top > Math.min(180, innerHeight / 3)) continue;
    const style = getComputedStyle(header);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 1) continue;
    const resolved = color(style.backgroundColor);
    if (resolved && resolved !== '#ffffff') return resolved;
  }
  return undefined;
}
