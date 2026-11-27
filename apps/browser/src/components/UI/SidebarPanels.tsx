import { PanelDockButton } from './PanelDockButton';
import { useLayoutEffect, useRef, useEffect, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
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
import { useAppList } from '../../utils/hooks/useAppList';
import {
  globalHookEnabledOnWebsite,
  CURRENT_HOOK_PAGE,
  type GlobalHook,
  type HookMarketplaceState,
} from '../../browser/hookMarketplace';
import {
  hookMatchesPath,
  hookMatchesWebsite,
  hookWebsiteExclusions,
} from '../../browser/siteDeveloper';
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
  const [pickerTab, setPickerTab] = useState<'active' | 'global'>('active');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [globalChoices, setGlobalChoices] = useState<
    Array<{
      hook: GlobalHook;
      allGroups: boolean;
      enabled: boolean;
      masterEnabled: boolean;
      wildcardExcluded: boolean;
    }>
  >([]);
  const [hookError, setHookError] = useState('');
  const { appList, lastIndex } = useAppList();
  const currentPage = appList[lastIndex];
  useEffect(() => {
    if (
      !pickerOpen ||
      pickerTab !== 'global' ||
      !currentPage ||
      !window.electron?.hookMarketplace
    )
      return;
    let live = true;
    const refresh = async () => {
      try {
        setGlobalChoices([]);
        const scopes = await Promise.all(
          [true, false].map(async (allGroups) => ({
            allGroups,
            state: (await window.electron.hookMarketplace.request({
              action: 'state',
              id: CURRENT_HOOK_PAGE,
              allGroups,
            })) as HookMarketplaceState,
          })),
        );
        if (!live) return;
        setGlobalChoices(
          scopes.flatMap(({ allGroups, state: hookState }) =>
            hookState.global.hooks
              .filter(
                (hook) =>
                  hookMatchesPath(hook.path, hookState.destination.url) &&
                  hookMatchesWebsite(hook, hookState.destination.url),
              )
              .map((hook) => ({
                hook,
                allGroups,
                masterEnabled: hookState.global.enabled && hook.enabled,
                wildcardExcluded: hookWebsiteExclusions(hook.exclusions, hookState.destination.url).some(rule => rule.startsWith('*.')),
                enabled:
                  hookState.global.enabled &&
                  hook.enabled &&
                  globalHookEnabledOnWebsite(hook, hookState.destination.url),
              })),
          ),
        );
        setHookError('');
      } catch (error) {
        if (live) {
          setGlobalChoices([]);
          setHookError(String(error).replace(/^Error: /, ''));
        }
      }
    };
    void refresh();
    window.addEventListener('kudium-hooks-changed', refresh);
    return () => {
      live = false;
      window.removeEventListener('kudium-hooks-changed', refresh);
    };
  }, [pickerOpen, pickerTab, currentPage?.id, currentPage?.url]);
  const slot = useRef<HTMLDivElement>(null);
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
    let lastLayout = '';
    const update = () => {
      const rect = element?.getBoundingClientRect();
      const bounds =
        active && !state.floating && rect && rect.width > 0 && rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null;
      const signature = JSON.stringify(bounds);
      if (signature === lastLayout) return;
      lastLayout = signature;
      void browser.sidebarPanels({ action: 'layout', id, bounds }).catch(() => {
        if (lastLayout === signature) lastLayout = '';
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    layoutUpdate.current = schedule;
    // A fixed-width native slot moves while its parent opens; position changes
    // do not trigger ResizeObserver. Reconcile once the shell finishes moving.
    const motionEnd = (event: Event) => {
      if (
        event.target instanceof Element &&
        element &&
        event.target.contains(element)
      )
        schedule();
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
  }, [active, state.activeId, state.openRequest, state.floating]);
  // Metadata refreshes can require layout, but must not hide or detach the view.
  useLayoutEffect(() => {
    layoutUpdate.current?.();
  }, [state.panels]);
  return (
    <section
      className="ai-sidebar-pane sidebar-feature-pane"
      hidden={!active}
      aria-label="Sidebar panels"
    >
      <AssistantPageHeader edgeToEdge>
        {(state.canGoBack || state.canGoForward) && (
          <>
        <ChromeIconButton
          icon={ChevronLeft}
          label="Previous panel"
          disabled={!state.canGoBack}
          onClick={() => { void browser.sidebarPanels({ action: 'back' }).catch(() => {}); }}
        />
        <ChromeIconButton
          icon={ChevronRight}
          label="Next panel"
          disabled={!state.canGoForward}
          onClick={() => { void browser.sidebarPanels({ action: 'forward' }).catch(() => {}); }}
        />
          </>
        )}
        <GroupPicker
          label="Sidebar panel"
          unselectedLabel={
            state.panels.find((panel) => panel.id === state.activeId)?.title ||
            'Choose a panel'
          }
          placeholder="Search panels…"
          header={
            <nav className="panel-picker-tabs" aria-label="Panel picker views">
              <button
                type="button"
                aria-pressed={pickerTab === 'active'}
                onClick={() => setPickerTab('active')}
              >
                Active ({state.panels.length})
              </button>
              <button
                type="button"
                aria-pressed={pickerTab === 'global'}
                onClick={() => setPickerTab('global')}
              >
                Global hooks
              </button>
            </nav>
          }
          onOpenChange={setPickerOpen}
          options={
            pickerTab === 'active'
              ? state.panels.map((panel) => ({
                  id: panel.id,
                  name: panel.title,
                  detail: panel.detail,
                  canManage: panel.canManage,
                  leadingIcon:
                    panel.kind === 'hook' ? (
                      <HookIcon size={14} />
                    ) : (
                      <SquareStack size={14} />
                    ),
                }))
              : globalChoices.map(
                  ({ hook, allGroups, enabled, masterEnabled, wildcardExcluded }) => ({
                    id: `global-choice:${allGroups ? 'all:' : ''}${hook.id}`,
                    name: hook.name,
                    detail: ![hook.before, hook.after, hook.css].some(source => source.trim())
                      ? 'Context-menu actions · Manage to use'
                      : enabled
                      ? 'Run on this page'
                      : !masterEnabled
                        ? 'Disabled globally · Manage to enable'
                        : wildcardExcluded
                          ? 'Excluded by a website rule · Manage to change'
                          : 'Enable here and run',
                    canManage: true,
                    actionLabel: enabled ? 'Run' : 'Enable',
                    disabled:
                      !masterEnabled || wildcardExcluded ||
                      ![hook.before, hook.after, hook.css].some((source) =>
                        source.trim(),
                      ),
                    leadingIcon: <HookIcon size={14} />,
                  }),
                )
          }
          onManage={(panel) => {
            if (pickerTab === 'global' && currentPage) {
              const choice = globalChoices.find(item => `global-choice:${item.allGroups ? 'all:' : ''}${item.hook.id}` === panel.id);
              if (!choice) return;
              void window.electron.hookMarketplace.request({ action:'global-editor-open', id:CURRENT_HOOK_PAGE, hookId:choice.hook.id, allGroups:choice.allGroups }).then(() => setHookError('')).catch(error => setHookError(String(error)));
            } else
              void browser
                .sidebarPanels({ action: 'manage', id: panel.id })
                .catch(() => {});
          }}
          value={state.activeId || ''}
          disabled={!state.panels.length && !currentPage}
          triggerClassName="sidebar-feature-panel-picker"
          onChange={(id) => {
            if (id.startsWith('global-choice:') && currentPage) {
              const choice = globalChoices.find(
                (item) =>
                  `global-choice:${item.allGroups ? 'all:' : ''}${item.hook.id}` ===
                  id,
              );
              if (choice)
                void window.electron.hookMarketplace
                  .request({
                    action: 'global-run',
                    id: CURRENT_HOOK_PAGE,
                    hookId: `global:${choice.allGroups ? 'all:' : ''}${choice.hook.id}`,
                    allGroups: choice.allGroups,
                  })
                  .catch((error) =>
                    setHookError(String(error).replace(/^Error: /, '')),
                  );
              return;
            }
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
        {!state.floating && <PanelDockButton />}
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
      {hookError && (
        <p role="alert" className="site-hook-import-error">
          {hookError}
        </p>
      )}
      <div
        className="sidebar-feature-content"
        ref={slot}
        style={{ position: 'relative' }}
      >
        {state.snapshot && (
          <img
            className="sidebar-panel-snapshot"
            src={state.snapshot.image}
            data-presentation-id={state.snapshot.presentationId}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              pointerEvents: 'none',
              borderRadius: 8,
            }}
          />
        )}
      </div>
    </section>
  );
}
