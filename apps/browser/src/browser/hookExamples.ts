export type HookStage = 'before' | 'after' | 'css';
export interface HookExample {
  id: string;
  name: string;
  stage: HookStage;
  source: string;
}
export const hookExamples: HookExample[] = [
  {
    id: 'dark-mode',
    name: 'Dark mode',
    stage: 'css',
    source: `/* A broad fallback for sites without their own dark theme. */
html { background:#fff !important; filter:invert(1) hue-rotate(180deg) !important; }
img, video, canvas, svg, iframe, [style*="background-image"] { filter:invert(1) hue-rotate(180deg) !important; }`,
  },
  {
    id: 'accent-colors',
    name: 'Custom accent colors',
    stage: 'css',
    source: `/* Change the accent color to customize links and controls. */
a[href] { color:#a855f7 !important; }
input, progress { accent-color:#a855f7 !important; }
::selection { background:#a855f7; color:white; }`,
  },
  {
    id: 'auto-scroll',
    name: 'Auto-scroll with pause control',
    stage: 'after',
    source: `(() => {
  const id = 'kudium-auto-scroll';
  document.getElementById(id)?.dispatchEvent(new Event('kudium-cleanup'));
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = 'Start auto-scroll';
  button.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;padding:10px 14px;border:0;border-radius:10px;background:#222;color:white;font:13px system-ui;cursor:pointer;';
  let timer;
  const stop = () => { clearInterval(timer); timer = undefined; button.textContent = 'Start auto-scroll'; };
  button.onclick = () => {
    if (timer) { stop(); return; }
    button.textContent = 'Pause auto-scroll';
    timer = setInterval(() => {
      window.scrollBy(0, 2); // Pixels per tick; increase for faster scrolling.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) stop();
    }, 30);
  };
  const pause = event => { if (event.type !== 'keydown' || event.key === 'Escape') stop(); };
  window.addEventListener('wheel', pause, { passive:true });
  window.addEventListener('touchstart', pause, { passive:true });
  window.addEventListener('keydown', pause);
  button.addEventListener('kudium-cleanup', () => {
    stop(); button.remove();
    window.removeEventListener('wheel', pause);
    window.removeEventListener('touchstart', pause);
    window.removeEventListener('keydown', pause);
  }, { once:true });
  context.onCleanup(() => button.dispatchEvent(new Event('kudium-cleanup')));
  (document.body || document.documentElement).append(button);
})();`,
  },
  {
    id: 'image-urls',
    name: 'Show image URLs below images',
    stage: 'after',
    source: `(() => {
  document.dispatchEvent(new Event('kudium-image-label-cleanup'));
  const update = () => {
    document.querySelectorAll('img').forEach(image => {
      const src = image.currentSrc || image.src;
      if (!src || !/^https?:/.test(src)) return;
      let label = image.nextElementSibling;
      if (!label?.matches('[data-kudium-image-url]')) {
        label = document.createElement('a');
        label.setAttribute('data-kudium-image-url', '');
        label.target = '_blank'; label.rel = 'noopener noreferrer';
        label.style.cssText = 'display:block;font:11px monospace;color:#3b82f6;overflow-wrap:anywhere;padding:4px 0;max-width:100%;';
        image.after(label);
      }
      if (label.textContent !== src) { label.textContent = src; label.href = src; }
    });
  };
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 150); };
  const observer = new MutationObserver(schedule);
  update();
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['src', 'srcset'] });
  document.addEventListener('load', schedule, true);
  const cleanup = () => {
    observer.disconnect(); clearTimeout(timer);
    document.removeEventListener('load', schedule, true);
    document.querySelectorAll('[data-kudium-image-url]').forEach(label => label.remove());
    document.removeEventListener('kudium-image-label-cleanup', cleanup);
  };
  document.addEventListener('kudium-image-label-cleanup', cleanup, { once:true });
  context.onCleanup(cleanup);
})();`,
  },
  {
    id: 'layout-outlines',
    name: 'Outline page layout',
    stage: 'css',
    source: `* { outline:1px solid rgba(59,130,246,.3) !important; }`,
  },
  {
    id: 'reading',
    name: 'Comfortable reading',
    stage: 'css',
    source: `/* Works with common article and main content elements. */
:where(article, main, [role="main"]) { line-height:1.7 !important; }
:where(article, main, [role="main"]) p { font-size:18px !important; max-width:75ch; }
html { scroll-behavior:smooth; }`,
  },
  {
    id: 'reduce-motion',
    name: 'Reduce animations',
    stage: 'css',
    source: `*, *::before, *::after {
  animation-duration:0.01ms !important;
  animation-iteration-count:1 !important;
  transition-duration:0.01ms !important;
  scroll-behavior:auto !important;
}`,
  },
  {
    id: 'page-activity',
    name: 'Add current page to Activity',
    stage: 'after',
    source: `// Run to record this page. If enabled, it also records each page load.
await context.activity.create({
  title: (document.title || 'Page opened').slice(0, 120),
  message: 'Visited ' + new URL(url).hostname,
  url,
});
log('Added current page to Activity');`,
  },
  {
    id: 'page-note',
    name: 'Save page text to Notes',
    stage: 'after',
    source: `const text = (document.querySelector('article, main') || document.body)?.innerText?.trim();
if (text) {
  await context.notes.create({ title:(document.title || 'Page capture').slice(0,120), body:'[Source](' + url + ')\\n\\n' + text.slice(0,90000) });
  log('Saved page to Notes');
}`,
  },
  {
    id: 'starting',
    name: 'Log page loading',
    stage: 'before',
    source: "log('Starting page', url);",
  },
];
const key = 'kudium-hook-examples-v1';
export function readHookExamples(): HookExample[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              typeof item.name === 'string' &&
              ['before', 'after', 'css'].includes(item.stage) &&
              typeof item.source === 'string' &&
              item.source.length <= 100000
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
export function saveHookExamples(examples: HookExample[]) {
  localStorage.setItem(key, JSON.stringify(examples));
}
