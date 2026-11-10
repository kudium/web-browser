/* Functional components use parameter defaults instead of deprecated defaultProps. */
/* eslint-disable react/require-default-props */
import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { AIGroup } from '../../browser/aiGroups';
import type { AIContextReference } from '../../browser/aiContext';
import { AIReferencePicker } from './AIReferencePicker';
import { browser } from '../../browser/client';
import { parseAISuggestions } from '../../browser/aiSuggestions';

/** Markdown remains presentation data: no raw HTML, active embeds or scripts. */
export function renderAIMessage(text: string, groups: AIGroup[] = []) {
  const renderer = new marked.Renderer();
  renderer.html = () => '';
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  // Preserve image references as links without fetching model-provided embeds.
  renderer.image = ({ href, text: alt }) =>
    `<a href="${escape(href)}">${escape(alt || 'View image')}</a>`;
  const parsed = marked.parse(text, {
    renderer,
    gfm: true,
    breaks: false,
    async: false,
  });
  const clean = DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'input',
    ],
    ALLOWED_ATTR: [
      'href',
      'title',
      'class',
      'start',
      'align',
      'type',
      'checked',
      'disabled',
    ],
  });
  const document = new DOMParser().parseFromString(clean, 'text/html');
  document.querySelectorAll('a').forEach((link) => {
    try {
      const href = link.getAttribute('href') || '';
      if (/^#kudiumbrowser-(?:note|activity)-[a-zA-Z0-9_-]{1,100}$/.test(href))
        return;
      const url = new URL(href);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
        throw new Error('Unsupported link');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } catch {
      link.removeAttribute('href');
    }
  });
  // Convert only plain text mentions; code, links and HTML never act as references.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    if (node.parentElement?.closest('a,pre,code')) return;
    const value = node.textContent || '';
    const pattern = /(?:^|\s)@([a-z0-9-]+)(?:\/([a-z0-9-]+))?(?=$|[\s.,!?;:])/g;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    [...value.matchAll(pattern)].forEach((match) => {
      const group = groups.find((entry) => entry.slug === match[1]);
      const page =
        match[2] && group?.tabs.find((entry) => entry.slug === match[2]);
      if (!group || (match[2] && !page)) return;
      const start = match.index! + (match[0].startsWith('@') ? 0 : 1);
      fragment.append(document.createTextNode(value.slice(offset, start)));
      const link = document.createElement('a');
      link.href = `#kudiumbrowser-reference-${encodeURIComponent(group.id)}${
        page ? `/${encodeURIComponent(page.id)}` : ''
      }`;
      link.className = 'ai-inline-reference';
      const name = page ? page.name : group.name;
      link.textContent = `@${
        name.length > 36 ? `${name.slice(0, 33)}…` : name
      }`;
      link.title = `${group.name} · ${group.tabs.length} tabs`;
      fragment.append(link);
      offset = match.index! + match[0].length;
    });
    if (offset) {
      fragment.append(document.createTextNode(value.slice(offset)));
      node.replaceWith(fragment);
    }
  });
  document.querySelectorAll('input').forEach((input) => {
    input.type = 'checkbox';
    input.disabled = true;
  });
  return document.body.innerHTML;
}

export function AIMessage({
  text,
  groups = [],
  onReference,
  onTabContextMenu,
  onGroupContextMenu,
  followUps = false,
  onSuggestion,
}: {
  text: string;
  groups?: AIGroup[];
  onReference?: (reference: AIContextReference) => void;
  onTabContextMenu?: (id: string) => void;
  onGroupContextMenu?: (id: string) => void;
  followUps?: boolean;
  onSuggestion?: (prompt: string) => void;
}) {
  const reply = useMemo(
    () => (followUps ? parseAISuggestions(text) : { text, suggestions: [] }),
    [text, followUps]
  );
  const html = useMemo(
    () => renderAIMessage(reply.text, groups),
    [reply.text, groups]
  );
  const [selected, setSelected] = useState<AIGroup>();
  const [copyError, setCopyError] = useState('');
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const activity = (event.target as HTMLElement).closest(
        'a[href^="#kudiumbrowser-activity-"]'
      );
      if (activity) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent('kudiumbrowser-open-activity', {
            detail: activity
              .getAttribute('href')!
              .slice('#kudiumbrowser-activity-'.length),
          })
        );
        return;
      }
      const noteLink = (event.target as HTMLElement).closest(
        'a[href^="#kudiumbrowser-note-"]'
      );
      if (noteLink) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent('kudiumbrowser-open-note', {
            detail: noteLink
              .getAttribute('href')!
              .slice('#kudiumbrowser-note-'.length),
          })
        );
        return;
      }
      const link = (event.target as HTMLElement).closest(
        'a.ai-inline-reference'
      );
      if (!link) return;
      event.preventDefault();
      const [groupId, tabId] = (link.getAttribute('href') || '')
        .slice('#kudiumbrowser-reference-'.length)
        .split('/')
        .map(decodeURIComponent);
      const group = groups.find((entry) => entry.id === groupId);
      if (!group) return;
      if (tabId)
        window.dispatchEvent(
          new CustomEvent('kudiumbrowser-ai-focus-tab', { detail: tabId })
        );
      setSelected(group);
    };
    const node = element.current;
    node?.addEventListener('click', click);
    return () => node?.removeEventListener('click', click);
  }, [groups]);
  return (
    <>
      <div
        className="ai-markdown"
        ref={element}
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;
          const link = target.closest<HTMLAnchorElement>('a');
          if (link?.classList.contains('ai-inline-reference')) {
            const [groupId, tabId] = (link.getAttribute('href') || '')
              .slice('#kudiumbrowser-reference-'.length)
              .split('/')
              .map(decodeURIComponent);
            const group = groups.find((entry) => entry.id === groupId);
            if (group && (tabId ? onTabContextMenu : onGroupContextMenu)) {
              event.preventDefault();
              event.stopPropagation();
              if (tabId && group.tabs.some((tab) => tab.id === tabId))
                onTabContextMenu?.(tabId);
              else if (!tabId) onGroupContextMenu?.(groupId);
              return;
            }
          }
          event.preventDefault();
          event.stopPropagation();
          const selection = window.getSelection();
          const selectedText =
            selection?.anchorNode &&
            element.current?.contains(selection.anchorNode)
              ? selection.toString()
              : '';
          const code = target.closest('pre,code')?.textContent || '';
          const href = link?.href || '';
          const safeLink = /^(https?:|mailto:)/i.test(href);
          browser
            .nativeMenu([
              ...(safeLink
                ? [
                    { id: 'open', label: 'Open link' },
                    { id: 'link', label: 'Copy link' },
                    { type: 'separator' as const },
                  ]
                : []),
              ...(selectedText
                ? [{ id: 'selection', label: 'Copy selection' }]
                : []),
              ...(code ? [{ id: 'code', label: 'Copy code' }] : []),
              { id: 'message', label: 'Copy message' },
            ])
            .then(async (choice) => {
              if (choice === 'open' && safeLink) link?.click();
              else if (choice === 'link' && safeLink)
                await navigator.clipboard.writeText(href);
              else if (choice === 'selection')
                await navigator.clipboard.writeText(selectedText);
              else if (choice === 'code')
                await navigator.clipboard.writeText(code);
              else if (choice === 'message')
                await navigator.clipboard.writeText(reply.text);
              return undefined;
            })
            .catch(() => setCopyError('Could not copy. Try again.'));
        }}
        // HTML is parsed Markdown, sanitized with DOMPurify and restricted above.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {onSuggestion && !!reply.suggestions.length && (
        <div
          className="ai-follow-up-suggestions"
          aria-label="Suggested follow-ups"
        >
          <span>What’s next</span>
          {reply.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      {copyError && <p role="alert">{copyError}</p>}
      {selected && (
        <AIReferencePicker
          key={selected.id}
          group={selected}
          onTabContextMenu={onTabContextMenu}
          onGroupContextMenu={onGroupContextMenu}
          initialOpen
          onClose={() => setSelected(undefined)}
          onAdd={(ref) => onReference?.(ref)}
        />
      )}
    </>
  );
}
