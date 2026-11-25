import { useLayoutEffect, useRef, useEffect, useState } from 'react';
import {
  X,
  SquareStack,
  LocateFixed,
  CircleAlert,
  ArrowUpRight,
  SquareArrowDownLeft,
} from 'lucide-react';
import { browser } from '../../browser/client';
import type { SidebarPanelState } from '../../browser/sidebarPanels';
import { AssistantPageHeader } from './AssistantPageHeader';
import { ChromeIconButton } from './ChromeIconButton';
import { GroupPicker } from './GroupPicker';
import { EmptyState } from './EmptyState';
import { HookIcon } from './HookIcon';

/** Shared slot for isolated native feature content; geometry belongs to this shell. */
export function SidebarPanels({
  state,
  active,
  onClose,
}: {
  state: SidebarPanelState;
  active: boolean;
  onClose: () => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const restoredTarget = useRef(false);
  const layoutUpdate = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (restoredTarget.current || !state.targets?.length) return;
    restoredTarget.current = true;
    try {
      const saved = localStorage.getItem('kudium-sidebar-panel-target');
      if (saved && state.targets.some((target) => target.id === saved))
        void browser
          .sidebarPanels({ action: 'target', groupId: saved })
          .catch(() => {});
    } catch {
      /* Optional target preference. */
    }
  }, [state.targets]);
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
            !pickerOpen &&
            !state.floating &&
            rect &&
            rect.width > 0 &&
            rect.height > 0
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null,
        })
        .catch(() => {});
    };
    layoutUpdate.current = update;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    // A fixed-width native slot moves while its parent opens; position changes
    // do not trigger ResizeObserver. Reconcile once the shell finishes moving.
    const motionEnd = (event: Event) => {
      if (event.target instanceof Element && element && event.target.contains(element)) schedule();
    };
    document.addEventListener('transitionend', motionEnd);
    document.addEventListener('transitioncancel', motionEnd);
    document.addEventListener('animationend', motionEnd);
    const observer = new ResizeObserver(schedule);
    if (element) observer.observe(element);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    update();
    return () => {
      layoutUpdate.current = undefined;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('transitionend', motionEnd);
      document.removeEventListener('transitioncancel', motionEnd);
      document.removeEventListener('animationend', motionEnd);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      void browser
        .sidebarPanels({ action: 'layout', id, bounds: null })
        .catch(() => {});
    };
  }, [
    active,
    pickerOpen,
    state.activeId,
    state.openRequest,
    state.floating,
  ]);
  // Metadata refreshes can require layout, but must not hide or detach the view.
  useLayoutEffect(() => { layoutUpdate.current?.(); }, [state.panels]);
  return (
    <section
      className="ai-sidebar-pane sidebar-feature-pane"
      hidden={!active}
      aria-label="Sidebar panels"
    >
      <AssistantPageHeader edgeToEdge>
        <GroupPicker
          label="Sidebar panel"
          unselectedLabel="Choose a panel"
          placeholder="Search panels…"
          options={state.panels.map((panel) => ({
            id: panel.id,
            name: panel.title,
            detail: panel.detail,
            leadingIcon: panel.kind === 'hook' ? <HookIcon size={14} /> : <SquareStack size={14} />,
          }))}
          value={state.activeId || ''}
          disabled={!state.panels.length}
          triggerClassName="sidebar-feature-panel-picker"
          onOpenChange={setPickerOpen}
          onChange={(id) => {
            void browser
              .sidebarPanels({ action: 'activate', id })
              .catch(() => {});
          }}
        />
        <GroupPicker
          label="Panel tab group"
          value={state.targetGroup || ''}
          disabled={!state.targets?.length}
          options={[
            {
              id: '',
              name: 'Auto · current group',
              leadingIcon: <LocateFixed size={14} />,
            },
            ...(state.targets || []).map((target) => ({
              id: target.id,
              name: target.title,
            })),
          ]}
          triggerClassName="sidebar-feature-group-picker"
          onOpenChange={setPickerOpen}
          onChange={(id) => {
            const groupId = id || undefined;
            try {
              groupId
                ? localStorage.setItem('kudium-sidebar-panel-target', groupId)
                : localStorage.removeItem('kudium-sidebar-panel-target');
            } catch {
              /* Optional preference. */
            }
            void browser
              .sidebarPanels({ action: 'target', groupId })
              .catch(() => {});
          }}
        />
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
          onClick={onClose}
        />
      </AssistantPageHeader>
      {state.error ? (
        <div role="alert">
          <EmptyState
            icon={<CircleAlert size={24} />}
            title="Panel couldn't load"
            description={state.error}
            action={
              state.activeId
                ? {
                    label: 'Try again',
                    onClick: () => {
                      void browser
                        .sidebarPanels({
                          action: 'activate',
                          id: state.activeId!,
                        })
                        .catch(() => {});
                    },
                  }
                : undefined
            }
          />
        </div>
      ) : !state.activeId ? (
        <EmptyState
          icon={<SquareStack size={24} />}
          title={
            state.panels.length ? 'Your side panels' : 'No panels in this group'
          }
          description={
            state.panels.length
              ? 'Open an extension or tool here. It will use the tab group selected above.'
              : 'Choose another tab group, or install an extension that supports side panels.'
          }
          action={
            state.panels[0]
              ? {
                  label: `Open ${state.panels[0].title}`,
                  onClick: () => {
                    void browser
                      .sidebarPanels({
                        action: 'activate',
                        id: state.panels[0].id,
                      })
                      .catch(() => {});
                  },
                }
              : undefined
          }
        />
      ) : state.floating ? (
        <EmptyState
          icon={<ArrowUpRight size={24} />}
          title="Panel is in its own window"
          description="Bring it back here to keep working in the sidebar."
          action={{
            label: 'Dock panel back',
            onClick: () => {
              void browser.sidebarPanels({ action: 'dock' }).catch(() => {});
            },
          }}
        />
      ) : null}
      <div className="sidebar-feature-content" ref={slot} />
    </section>
  );
}
