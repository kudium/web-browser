/* Panel placement is optional; unavailable storage must not interrupt work. */
/* eslint-disable react/require-default-props */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelOverlayProvider } from './PanelDialog';
import {
  AssistantPanelDocumentContext,
  AssistantPanelWindowContext,
} from './AssistantPanelContext';
import { installFocusModality } from '../../utils/focusModality';

export type AssistantPanel =
  | 'assistant'
  | 'notes'
  | 'activity'
  | 'tasks'
  | 'developer';
export const ASSISTANT_PANEL_NAMES: Record<AssistantPanel, string> = {
  assistant: 'Chat',
  notes: 'Notes',
  activity: 'Activity',
  tasks: 'Tasks',
  developer: 'Developer',
};
const windows = new Map<string, Window>();
export function focusAssistantPanel(panel: string) {
  const floating = windows.get(panel);
  if (!floating || floating.closed) return false;
  floating.focus();
  return true;
}

/** Adopt a stable portal container so editors and streams never remount. */
export function AssistantPanelHost({
  panel,
  active,
  children,
}: {
  panel: AssistantPanel;
  active: boolean;
  children: ReactNode;
}) {
  const dock = useRef<HTMLDivElement>(null);
  const [container] = useState(() => document.createElement('div'));
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [floating, setFloating] = useState(false);
  const [panelDocument, setPanelDocument] = useState(document);
  const [visited, setVisited] = useState(active);
  const shuttingDown = useRef(false);
  const [error, setError] = useState('');
  const cleanup = useRef<() => void>();
  const placementKey = `kudium-assistant-window-${panel}`;
  const title = ASSISTANT_PANEL_NAMES[panel];
  const dockBack = () => {
    cleanup.current?.();
    cleanup.current = undefined;
  };
  const undock = () => {
    if (focusAssistantPanel(panel)) return;
    let geometry = {
      width: 520,
      height: 740,
      left: window.screenX + 60,
      top: window.screenY + 60,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(placementKey) || 'null');
      if (
        saved &&
        Number.isFinite(saved.width) &&
        Number.isFinite(saved.height)
      ) {
        geometry = {
          width: Math.max(320, Math.min(saved.width, window.screen.availWidth)),
          height: Math.max(
            360,
            Math.min(saved.height, window.screen.availHeight)
          ),
          left: Number.isFinite(saved.left) ? saved.left : geometry.left,
          top: Number.isFinite(saved.top) ? saved.top : geometry.top,
        };
      }
    } catch {
      /* Use a comfortable default. */
    }
    const child = window.open(
      'about:blank',
      `kudium-assistant-${panel}`,
      `popup,width=${geometry.width},height=${geometry.height},left=${geometry.left},top=${geometry.top}`
    );
    if (!child) {
      setError('Could not open the panel window. Try again.');
      return;
    }
    setError('');
    setVisited(true);
    child.document.title = `${title} — Kudium Browser`;
    const styles = child.document.createElement('div');
    child.document.head.appendChild(styles);
    const theme = child.document.createElement('div');
    child.document.body.appendChild(theme);
    const sync = () => {
      styles.replaceChildren(
        ...Array.from(
          document.head.querySelectorAll('style,link[rel="stylesheet"]')
        ).map((node) => {
          const copy = node.cloneNode(true) as HTMLElement;
          if (node instanceof HTMLLinkElement)
            copy.setAttribute('href', node.href);
          return copy;
        })
      );
      child.document.documentElement.dataset.platform =
        document.documentElement.dataset.platform;
      const source = dock.current?.closest('.radix-themes');
      if (source) {
        Array.from(theme.attributes).forEach((attr) =>
          theme.removeAttribute(attr.name)
        );
        Array.from(source.attributes).forEach((attr) =>
          theme.setAttribute(attr.name, attr.value)
        );
      }
      theme.classList.add('assistant-floating-theme');
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const source = dock.current?.closest('.radix-themes');
    if (source) observer.observe(source, { attributes: true });
    theme.appendChild(container);
    setPanelDocument(child.document);
    const stopFocusModality = installFocusModality(child.document);
    container.className =
      'assistant-panel-content ai-sidebar assistant-floating-panel';
    windows.set(panel, child);
    setFloating(true);
    const save = (isFloating: boolean) => {
      try {
        localStorage.setItem(
          placementKey,
          JSON.stringify({
            floating: isFloating,
            width: child.outerWidth,
            height: child.outerHeight,
            left: child.screenX,
            top: child.screenY,
          })
        );
      } catch {
        /* Optional layout preference. */
      }
    };
    save(true);
    const timer = setInterval(() => {
      if (!child.closed) save(true);
    }, 1000);
    let finished = false;
    let close: () => void;
    cleanup.current = () => {
      if (finished) return;
      finished = true;
      save(shuttingDown.current);
      clearInterval(timer);
      observer.disconnect();
      stopFocusModality();
      windows.delete(panel);
      dock.current?.appendChild(container);
      container.className = 'assistant-panel-content';
      setPanelDocument(document);
      setFloating(false);
      child.removeEventListener('beforeunload', close);
      if (!child.closed) child.close();
      if (!shuttingDown.current) {
        try {
          localStorage.setItem(
            'kudiumbrowser-ai-page-pane',
            JSON.stringify(panel)
          );
          localStorage.setItem('kudiumbrowser-ai-page-open', 'true');
          ['pane', 'open'].forEach((key) =>
            window.dispatchEvent(
              new CustomEvent('ai-page-preference-changed', {
                detail: `kudiumbrowser-ai-page-${key}`,
              })
            )
          );
        } catch {
          /* Keep the restored panel available. */
        }
      }
    };
    close = () => {
      dockBack();
      try {
        localStorage.setItem('kudiumbrowser-ai-page-open', 'false');
        window.dispatchEvent(
          new CustomEvent('ai-page-preference-changed', {
            detail: 'kudiumbrowser-ai-page-open',
          })
        );
      } catch {
        /* The panel remains safely docked. */
      }
    };
    child.addEventListener('beforeunload', close);
    child.focus();
  };
  useEffect(() => {
    container.className = 'assistant-panel-content';
    dock.current?.appendChild(container);
    try {
      if (JSON.parse(localStorage.getItem(placementKey) || 'null')?.floating)
        undock();
    } catch {
      /* Optional preference. */
    }
    const stop = () => {
      shuttingDown.current = true;
      dockBack();
    };
    window.addEventListener('beforeunload', stop);
    return () => {
      window.removeEventListener('beforeunload', stop);
      shuttingDown.current = true;
      dockBack();
      container.remove();
    };
    // One stable container and lifecycle per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (active) {
      setVisited(true);
      focusAssistantPanel(panel);
    }
  }, [active, panel]);
  return (
    <div className="assistant-panel-host" hidden={!active} ref={dock}>
      {floating && (
        <div className="assistant-panel-away">
          <span>{title} is open in its own window.</span>
          <button type="button" onClick={() => focusAssistantPanel(panel)}>
            Show window
          </button>
          <button type="button" onClick={dockBack}>
            Dock back
          </button>
        </div>
      )}
      {createPortal(
        <AssistantPanelDocumentContext.Provider value={panelDocument}>
          <PanelOverlayProvider container={overlay}>
            {error && <p role="alert">{error}</p>}
            {/* Placement callbacks track the current native window lifecycle. */}
            <AssistantPanelWindowContext.Provider
              // eslint-disable-next-line react/jsx-no-constructed-context-values
              value={{ title, floating, toggle: floating ? dockBack : undock }}
            >
              {visited && children}
            </AssistantPanelWindowContext.Provider>
            <div className="ai-overlay-layer" ref={setOverlay} />
          </PanelOverlayProvider>
        </AssistantPanelDocumentContext.Provider>,
        container
      )}
    </div>
  );
}
