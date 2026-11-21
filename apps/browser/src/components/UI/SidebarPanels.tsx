import { useLayoutEffect, useRef } from 'react';
import {
  X,
  ChevronDown,
  ArrowUpRight,
  SquareArrowDownLeft,
} from 'lucide-react';
import { browser } from '../../browser/client';
import type { SidebarPanelState } from '../../browser/sidebarPanels';
import { AssistantPageHeader } from './AssistantPageHeader';
import { ChromeIconButton } from './ChromeIconButton';

/** Shared slot for isolated native feature content; geometry belongs to this shell. */
export function SidebarPanels({
  state,
  active,
}: {
  state: SidebarPanelState;
  active: boolean;
}) {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const id = state.activeId;
    if (!id) return undefined;
    const element = slot.current;
    let frame = 0;
    const update = () => {
      const rect = element?.getBoundingClientRect();
      void browser
        .sidebarPanels({
          action: 'layout',
          id,
          bounds:
            active &&
            !state.floating &&
            rect &&
            rect.width > 0 &&
            rect.height > 0
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null,
        })
        .catch(() => {});
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    if (element) observer.observe(element);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      void browser
        .sidebarPanels({ action: 'layout', id, bounds: null })
        .catch(() => {});
    };
  }, [active, state.activeId, state.panels, state.floating]);
  return (
    <section
      className="ai-sidebar-pane sidebar-feature-pane"
      hidden={!active}
      aria-label="Sidebar panels"
    >
      <AssistantPageHeader>
        <div className="sidebar-feature-picker">
          <select
            aria-label="Sidebar panel"
            value={state.activeId || ''}
            onChange={(event) => {
              void browser
                .sidebarPanels({ action: 'activate', id: event.target.value })
                .catch(() => {});
            }}
          >
            <option value="" disabled>
              Choose a panel
            </option>
            {state.panels.map((panel) => (
              <option key={panel.id} value={panel.id}>
                {panel.title}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <ChromeIconButton
          icon={state.floating ? SquareArrowDownLeft : ArrowUpRight}
          label={state.floating ? 'Dock panel back' : 'Undock panel'}
          disabled={!state.activeId || Boolean(state.error)}
          onClick={() => {
            void browser
              .sidebarPanels({ action: state.floating ? 'dock' : 'undock' })
              .catch(() => {});
          }}
        />
        <ChromeIconButton
          icon={X}
          label="Close sidebar panel"
          onClick={() => {
            void browser.sidebarPanels({ action: 'close' }).catch(() => {});
          }}
        />
      </AssistantPageHeader>
      {state.error && <p role="alert">{state.error}</p>}
      {!state.activeId && <p>Choose a panel to open it here.</p>}
      {state.floating && <p>This panel is open in a separate window.</p>}
      <div className="sidebar-feature-content" ref={slot} />
    </section>
  );
}
