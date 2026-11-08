import { createElement, useEffect, useRef, useState } from 'react';
import { Button, Text, TextField } from '@radix-ui/themes';
import { browser } from './client';
import type { BrowserState } from './contracts';
import type { PreferenceInfo } from './preferences';

// Use the engine's buttons to preserve icons, badges and popup anchors.
export function ExtensionPicker({
  context,
  order,
  close,
  manage,
  store,
}: {
  context: BrowserState['extensionContext'];
  order: string[] | null;
  close: () => void;
  manage: () => void;
  store: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  const actionRows = useRef(new Map<HTMLElement, HTMLElement>());
  const pinPending = useRef(false);
  const [catalog, setCatalog] = useState<PreferenceInfo['extensionCatalog']>();
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    browser
      .preferenceAction('info')
      .then((info) => {
        if (live) setCatalog((info as PreferenceInfo)?.extensionCatalog || []);
        return null;
      })
      .catch(() => {
        if (live) setError('Extensions could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, [context?.profile]);
  useEffect(() => {
    const root = element.current?.shadowRoot;
    if (!root) return undefined;
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; width: 100%; }
      .picker-row { display: flex; align-items: center; gap: 8px; min-height: 36px; border-radius: 8px; padding: 2px 4px; }
      .picker-row:hover, .picker-row:focus-within { background: var(--gray-a3); }
      .picker-row[hidden] { display: none; }
      .picker-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
      .picker-name, .picker-pin { border: 0; background: transparent; color: var(--gray-12); font: inherit; padding: 6px; border-radius: 6px; cursor: pointer; }
      .picker-pin { width: 30px; color: var(--gray-10); }
      .picker-pin[aria-pressed=true] { color: var(--accent-11); background: var(--accent-a3); }
      .picker-pin:disabled { opacity: .5; cursor: default; }
      .action { flex: 0 0 28px; margin: 0; }
      button:focus-visible { outline: 2px solid var(--accent-8); outline-offset: 1px; }
    `;
    root.appendChild(style);
    const rows = actionRows.current;
    const update = () => {
      const actions = [...root.querySelectorAll<HTMLElement>('.action')];
      rows.forEach((row, action) => {
        if (!actions.includes(action)) {
          row.remove();
          rows.delete(action);
        }
      });
      let matches = 0;
      actions.forEach((action) => {
        let row = rows.get(action);
        if (!row) {
          row = document.createElement('div');
          row.className = 'picker-row';
          const label = document.createElement('button');
          label.className = 'picker-name';
          label.type = 'button';
          label.onclick = () => action.click();
          label.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              action.click();
            }
          };
          label.oncontextmenu = (event) => {
            event.preventDefault();
            action.dispatchEvent(
              new MouseEvent('contextmenu', { bubbles: true })
            );
          };
          const pin = document.createElement('button');
          pin.className = 'picker-pin';
          pin.type = 'button';
          const icon = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
          );
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.setAttribute('width', '16');
          icon.setAttribute('height', '16');
          icon.setAttribute('aria-hidden', 'true');
          const shape = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
          );
          shape.setAttribute('d', 'M16 3H8l1 7-3 3v3h12v-3l-3-3 1-7M12 16v6');
          shape.setAttribute('fill', 'none');
          shape.setAttribute('stroke', 'currentColor');
          shape.setAttribute('stroke-width', '1.7');
          shape.setAttribute('stroke-linejoin', 'round');
          icon.appendChild(shape);
          pin.appendChild(icon);
          row.append(action, label, pin);
          root.appendChild(row);
          rows.set(action, row);
        }
        action.tabIndex = -1;
        const name =
          catalog?.find((item) => item.id === action.id)?.name ||
          action.title ||
          'Extension';
        const label = row.querySelector<HTMLButtonElement>('.picker-name')!;
        if (label.textContent !== name) label.textContent = name;
        if (label.title !== (action.title || name))
          label.title = action.title || name;
        const pin = row.querySelector<HTMLButtonElement>('.picker-pin')!;
        const pinned = order === null || order.includes(action.id);
        pin.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${name}`);
        pin.setAttribute('aria-pressed', String(pinned));
        const pinTitle = pinned ? 'Unpin from toolbar' : 'Pin to toolbar';
        if (pin.title !== pinTitle) pin.title = pinTitle;
        pin.disabled = busy || !catalog;
        pin.onclick = async () => {
          if (pinPending.current || !catalog) return;
          pinPending.current = true;
          const current = order ?? [
            ...new Set([
              ...catalog.map((item) => item.id),
              ...actions.map((item) => item.id),
            ]),
          ];
          setBusy(true);
          setError('');
          try {
            await browser.preferences('update', {
              extensionToolbarOrder: pinned
                ? current.filter((id) => id !== action.id)
                : [...current, action.id],
            });
          } catch {
            setError('Toolbar could not be updated. Try again.');
          } finally {
            pinPending.current = false;
            setBusy(false);
          }
        };
        row.hidden = !`${name} ${action.title}`
          .toLowerCase()
          .includes(query.toLowerCase().trim());
        if (!row.hidden) matches += 1;
      });
      setCount(matches);
    };
    const activate = (event: Event) => {
      if ((event.target as Element)?.closest('.action')) close();
    };
    root.addEventListener('click', activate);
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title'],
    });
    return () => {
      observer.disconnect();
      root.removeEventListener('click', activate);
      style.remove();
    };
  }, [context?.profile, catalog, order, query, busy, close]);
  return (
    <div className="extension-picker">
      <TextField.Root
        aria-label="Search extensions"
        placeholder="Search extensions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && (
        <Text role="alert" color="red" size="2">
          {error}
        </Text>
      )}
      <div className="extension-picker-list">
        {context &&
          createElement('browser-action-list', {
            key: context.profile,
            ref: element,
            partition: context.profile,
            tab: context.tab,
            alignment: 'bottom left',
            'aria-label': 'Available extensions',
          })}
        {!count && (
          <Text size="2" color="gray">
            {query
              ? 'No matching extensions'
              : 'No extensions available in this session'}
          </Text>
        )}
      </div>
      <div className="extension-picker-footer">
        <Button variant="ghost" onClick={store} disabled={!context}>
          Add extension…
        </Button>
        <Button variant="ghost" onClick={manage}>
          Manage extensions…
        </Button>
      </div>
    </div>
  );
}
