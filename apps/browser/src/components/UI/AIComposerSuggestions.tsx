import { ReactNode, RefObject, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function AIComposerSuggestions({
  input,
  cursor,
  value,
  selectedIndex,
  children,
}: {
  input: RefObject<HTMLTextAreaElement>;
  cursor: number;
  value: string;
  selectedIndex: number;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const textarea = input.current;
    const container = popup.current;
    if (!textarea || !container) return undefined;
    const position = () => {
      const rect = textarea.getBoundingClientRect();
      const styles = getComputedStyle(textarea);
      // Mirror textarea wrapping to find the caret on wrapped/scrolled lines.
      const mirror = document.createElement('div');
      for (const property of [
        'font',
        'line-height',
        'letter-spacing',
        'text-indent',
        'text-transform',
        'padding',
        'tab-size',
        'word-spacing',
      ])
        mirror.style.setProperty(property, styles.getPropertyValue(property));
      Object.assign(mirror.style, {
        position: 'fixed',
        visibility: 'hidden',
        top: '0',
        left: '0',
        width: `${textarea.clientWidth}px`,
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
      });
      mirror.textContent = value.slice(0, cursor);
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      mirror.appendChild(marker);
      mirror.appendChild(document.createTextNode(value.slice(cursor)));
      document.body.appendChild(mirror);
      const caret = marker.getBoundingClientRect();
      const lineHeight =
        parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.6;
      const lineTop = Math.max(
        rect.top,
        Math.min(
          rect.bottom - lineHeight,
          rect.top + textarea.clientTop + caret.top - textarea.scrollTop
        )
      );
      const width = Math.min(360, Math.max(0, window.innerWidth - 16));
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - width - 8,
          rect.left + textarea.clientLeft + caret.left - textarea.scrollLeft
        )
      );
      mirror.remove();
      const below = Math.max(0, window.innerHeight - lineTop - lineHeight - 14);
      const above = Math.max(0, lineTop - 14);
      const opensBelow = below >= 100 || below >= above;
      Object.assign(container.style, {
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${Math.min(220, opensBelow ? below : above)}px`,
        top: `${opensBelow ? lineTop + lineHeight + 6 : lineTop - 6}px`,
        transform: opensBelow ? 'none' : 'translateY(-100%)',
      });
    };
    position();
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(position)
        : undefined;
    observer?.observe(textarea);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [input, cursor, value, children]);
  useLayoutEffect(() => {
    popup.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);
  return createPortal(
    <div className="ai-composer-suggestions" ref={popup}>
      {children}
    </div>,
    input.current?.closest('.workspace') ||
      input.current?.closest('.radix-themes') ||
      document.body
  );
}
