import { useEffect, useState } from 'react';
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { BrowserCommand, BrowserState } from '../../browser/contracts';
import type { IApp } from '../../types';
import { AppIcon } from './AppIcon/AppIcon';

export function SidebarMediaWidget({
  tabs,
  states,
  selectedId,
  onCommand,
  onSelect,
}: {
  tabs: IApp[];
  states: Record<string, BrowserState>;
  selectedId: string | undefined;
  onCommand: (command: BrowserCommand) => void;
  onSelect: (tab: IApp) => void;
}) {
  const [settledSelectedId, setSettledSelectedId] = useState(selectedId);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSettledSelectedId(selectedId),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [selectedId]);
  const [rememberedId, setRememberedId] = useState<string>();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  useEffect(() => {
    setDismissedIds((ids) =>
      ids.includes(settledSelectedId || '')
        ? ids.filter((id) => id !== settledSelectedId)
        : ids,
    );
  }, [settledSelectedId]);
  const remembered = tabs.find(
    (item) =>
      item.id === rememberedId &&
      !states[item.id]?.discarded &&
      states[item.id]?.sidebarMediaEligible,
  );
  const activeMedia =
    (remembered &&
    (states[remembered.id]?.mediaPlaying || states[remembered.id]?.audible) &&
    states[remembered.id]?.sidebarMediaEligible
      ? remembered
      : undefined) ||
    tabs.find(
      (tab) =>
        states[tab.id]?.sidebarMediaEligible &&
        (states[tab.id]?.mediaPlaying || states[tab.id]?.audible),
    );
  const playing =
    (activeMedia && !dismissedIds.includes(activeMedia.id)
      ? activeMedia
      : undefined) ||
    tabs.find(
      (tab) =>
        !dismissedIds.includes(tab.id) &&
        states[tab.id]?.sidebarMediaEligible &&
        (states[tab.id]?.mediaPlaying || states[tab.id]?.audible),
    );
  const activeId = activeMedia?.id;
  useEffect(() => {
    if (activeId) setRememberedId(activeId);
  }, [activeId]);
  const tab =
    playing ||
    tabs.find(
      (item) =>
        item.id === rememberedId &&
        !dismissedIds.includes(item.id) &&
        !states[item.id]?.discarded &&
        states[item.id]?.sidebarMediaEligible,
    );
  if (!tab) return null;
  const state = states[tab.id];
  if (!state) return null;
  const isPlaying = Boolean(state.mediaPlaying || state.audible);
  const send = (action: BrowserCommand['action']) =>
    onCommand({ id: tab.id, action });
  return (
    <div
      className="sidebar-media-widget"
      hidden={tab.id === settledSelectedId}
      role="group"
      aria-label={`Media controls for ${state.title || tab.name}`}
    >
      <button
        type="button"
        className="sidebar-media-focus"
        title={`Open ${state.title || tab.name}`}
        aria-label={`Focus tab ${state.title || tab.name}`}
        onClick={() => onSelect(tab)}
      />
      <button
        type="button"
        className="sidebar-media-source"
        title={`Open ${state.title || tab.name}`}
        aria-label={`Open ${state.title || tab.name}`}
        onClick={() => onSelect(tab)}
      >
        <AppIcon
          icon={state.icon ?? tab.icon}
          title={state.title || tab.name}
        />
        {isPlaying && !state.muted && (
          <span className="sidebar-media-equalizer" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
      </button>
      <button
        type="button"
        title="Previous track"
        aria-label="Previous track"
        onClick={() => send('media-previous')}
      >
        <SkipBack size={15} fill="currentColor" />
      </button>
      <button
        type="button"
        title={isPlaying ? 'Pause' : 'Resume'}
        aria-label={isPlaying ? 'Pause' : 'Resume'}
        onClick={() => send('media-play-pause')}
      >
        {isPlaying ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" />
        )}
      </button>
      <button
        type="button"
        title="Next track"
        aria-label="Next track"
        onClick={() => send('media-next')}
      >
        <SkipForward size={15} fill="currentColor" />
      </button>
      <button
        type="button"
        title={state.muted ? 'Unmute site' : 'Mute site'}
        aria-label={state.muted ? 'Unmute site' : 'Mute site'}
        aria-pressed={Boolean(state.muted)}
        onClick={() => send('toggle-mute')}
      >
        {state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button
        type="button"
        className="sidebar-media-dismiss"
        title="Dismiss media widget"
        aria-label="Dismiss media widget"
        onClick={() => setDismissedIds((ids) => [...ids, tab.id])}
      >
        <X size={13} />
      </button>
    </div>
  );
}
