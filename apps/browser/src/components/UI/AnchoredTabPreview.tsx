import { Button, Popover } from '@radix-ui/themes';
import {
  ArrowLeft,
  Layers,
  MessageCircle,
  Pin,
  PinOff,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CollectionIcon } from './CollectionIcon';
import type { IApp } from '../../types';
import { GroupIcon as GroupIdentityIcon } from './GroupIcon';
import { AppIcon } from './AppIcon/AppIcon';
import { ChromeIconButton } from './ChromeIconButton';
import { FormInput } from './FormControls';
import type { AnchoredPreviewTarget } from '../../utils/useAnchoredPreview';

export interface PreviewEntry {
  id: string;
  title: string;
  detail: string;
  icon: string;
  group?: IApp;
}
const visibleRows = 7;
const overscan = 3;

// Optional reference detail is shared by group hover previews.
/* eslint-disable react/require-default-props */
export function AnchoredTabPreview({
  target,
  title,
  subtitle = '',
  glass = false,
  icon = '',
  group,
  tabs = [],
  entries,
  selectedId,
  onSelect,
  onSelectGroup,
  onToggleFavorite,
  onEntryContextMenu,
  onGroupContextMenu,
  onRemove,
  onNewTab,
  onBack,
  onClose,
  onEnter,
  onLeave,
}: {
  target: AnchoredPreviewTarget;
  title: string;
  subtitle?: string;
  glass?: boolean;
  icon?: string;
  group?: IApp;
  tabs?: IApp[];
  entries: PreviewEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSelectGroup?: () => void;
  onToggleFavorite?: () => void;
  onEntryContextMenu?: (id: string) => void;
  onGroupContextMenu?: () => void;
  onRemove: (id: string) => void;
  onNewTab: () => void;
  onBack: () => void;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const rowHeight = target.kind === 'session' ? 32 : 40;
  const GroupIcon = target.kind === 'folder' ? CollectionIcon : Layers;
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [highlighted, setHighlighted] = useState(() =>
    Math.max(
      0,
      entries.findIndex((entry) => entry.id === selectedId)
    )
  );
  const showSearch =
    entries.length > visibleRows || target.interaction !== 'hover';
  const viewport = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const measureSide = useCallback(
    () =>
      target.anchor.getBoundingClientRect().right +
        8 +
        Math.min(280, window.innerWidth - 16) <=
      window.innerWidth - 8
        ? ('right' as const)
        : ('bottom' as const),
    [target.anchor]
  );
  const [side, setSide] = useState(measureSide);
  useLayoutEffect(() => {
    const update = () => setSide(measureSide());
    const observer = new ResizeObserver(update);
    observer.observe(target.anchor);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [target.anchor, measureSide]);
  const anchorRef = useMemo(
    () => ({ current: target.anchor }),
    [target.anchor]
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? entries.filter((entry) =>
          `${entry.title} ${entry.detail}`.toLocaleLowerCase().includes(needle)
        )
      : entries;
  }, [query, entries]);
  const activeIndex = Math.min(highlighted, Math.max(0, matches.length - 1));
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(matches.length, start + visibleRows + overscan * 2);
  useEffect(() => {
    const list = viewport.current;
    if (!list) return;
    const top = activeIndex * rowHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + rowHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + rowHeight - list.clientHeight;
    setScrollTop(list.scrollTop);
  }, [activeIndex, rowHeight]);
  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Content
        className="anchored-tab-preview"
        data-kind={target.kind}
        data-glass={glass}
        data-search={showSearch}
        side={side}
        align="start"
        size="1"
        sideOffset={6}
        collisionPadding={8}
        aria-label={title}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onInteractOutside={(event) => {
          // The virtual anchor owns its click toggle, rather than being a Radix trigger.
          if (
            event.target instanceof Node &&
            target.anchor.contains(event.target)
          )
            event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (target.interaction !== 'hover') searchInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (target.interaction === 'keyboard' && target.anchor.isConnected)
            target.anchor.focus();
        }}
      >
        <div
          className="tab-preview-heading"
          onContextMenu={(event) => {
            if (!onGroupContextMenu) return;
            event.preventDefault();
            event.stopPropagation();
            onGroupContextMenu();
          }}
        >
          {target.parentFolder && (
            <ChromeIconButton
              icon={ArrowLeft}
              label="Back to collection"
              onClick={onBack}
            />
          )}
          <div className="tab-preview-group-icon" aria-hidden="true">
            {group && <GroupIdentityIcon item={group} tabs={tabs} />}
            {!group && icon && <AppIcon icon={icon} title={title} />}
            {!group && !icon && <GroupIcon size={22} />}
          </div>
          <div className="tab-preview-title">
            <strong>{title}</strong>
            {subtitle && (
              <Button
                size="1"
                variant="ghost"
                className="tab-preview-slug"
                title={`Select @${subtitle} in the AI sidebar`}
                aria-label={`Select @${subtitle} in the AI sidebar`}
                onClick={onSelectGroup}
                disabled={!onSelectGroup}
              >
                @{subtitle}
              </Button>
            )}
          </div>
          {target.kind === 'session' && (
            <ChromeIconButton
              icon={Plus}
              label="New tab in previewed group"
              onClick={onNewTab}
            />
          )}
        </div>
        {showSearch && (
          <div className="tab-preview-search">
            <Search size={14} aria-hidden="true" />
            <FormInput
              ref={searchInput}
              aria-label="Search preview"
              placeholder={
                target.kind === 'folder' ? 'Search groups…' : 'Search tabs…'
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
                setScrollTop(0);
                if (viewport.current) viewport.current.scrollTop = 0;
              }}
              onKeyDown={(event) => {
                if (
                  ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  let nextIndex =
                    activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
                  if (event.key === 'Home') nextIndex = 0;
                  if (event.key === 'End') nextIndex = matches.length - 1;
                  setHighlighted(
                    Math.max(0, Math.min(matches.length - 1, nextIndex))
                  );
                } else if (event.key === 'Enter' && matches[activeIndex]) {
                  event.preventDefault();
                  onSelect(matches[activeIndex].id);
                }
              }}
            />
          </div>
        )}
        <div
          className="tab-preview-list"
          ref={viewport}
          style={{ height: Math.min(visibleRows, matches.length) * rowHeight }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div
            style={{ height: matches.length * rowHeight, position: 'relative' }}
          >
            {matches.slice(start, end).map((entry, index) => (
              <div
                className="tab-preview-row"
                key={entry.id}
                data-highlighted={
                  target.interaction !== 'hover' &&
                  start + index === activeIndex
                }
                onMouseEnter={() => setHighlighted(start + index)}
                onContextMenu={(event) => {
                  if (!onEntryContextMenu) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onEntryContextMenu(entry.id);
                }}
                style={{
                  position: 'absolute',
                  top: (start + index) * rowHeight,
                  height: rowHeight,
                }}
              >
                <button
                  type="button"
                  aria-label={entry.title}
                  aria-current={entry.id === selectedId ? 'page' : undefined}
                  onClick={() => onSelect(entry.id)}
                  title={`${entry.title}\n${entry.detail}`}
                >
                  {entry.group ? (
                    <GroupIdentityIcon item={entry.group} tabs={tabs} />
                  ) : (
                    <AppIcon icon={entry.icon} title={entry.title} />
                  )}
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{entry.detail}</small>
                  </span>
                </button>
                {target.kind === 'session' && (
                  <ChromeIconButton
                    icon={X}
                    label={`Close ${entry.title}`}
                    onClick={() => onRemove(entry.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {!matches.length && <p className="tab-preview-empty">No matches</p>}
        {target.kind === 'session' && (
          <div className="tab-preview-actions" aria-label="Group actions">
            <Button
              size="1"
              variant="ghost"
              onClick={onToggleFavorite}
              disabled={!onToggleFavorite}
              aria-pressed={!!group?.favorite}
            >
              {group?.favorite ? <PinOff size={15} /> : <Pin size={15} />}
              {group?.favorite ? 'Unpin from favorites' : 'Pin to favorites'}
            </Button>
            <Button
              size="1"
              variant="ghost"
              onClick={onSelectGroup}
              disabled={!onSelectGroup}
            >
              <MessageCircle size={15} />
              AI Chat
            </Button>
          </div>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
