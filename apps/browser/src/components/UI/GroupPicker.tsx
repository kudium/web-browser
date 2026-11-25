/* Optional interaction callbacks use parameter defaults. */
/* eslint-disable react/require-default-props */
import { Button, Popover, TextField } from '@radix-ui/themes';
import { Search, ChevronDown, Check, Settings2 } from 'lucide-react';
import {
  ReactNode,
  MouseEvent,
  KeyboardEvent,
  useId,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { PanelPopoverContent } from './PanelDialog';
import { aiGroupId } from '../../browser/aiGroups';
import { AppManager } from '../../utils/AppManager';
import { IApp } from '../../types';
import { groupKey, loginProfileKey } from '../../utils/groups';
import { GroupIcon } from './GroupIcon';
import { AppIcon } from './AppIcon/AppIcon';

export interface GroupOption {
  id: string;
  name: string;
  detail?: string;
  hint?: string;
  icon?: string;
  group?: IApp;
  leadingIcon?: ReactNode;
  canManage?: boolean;
  disabled?: boolean;
}
export function GroupPicker({
  options,
  value,
  onChange,
  label,
  disabled,
  placeholder = 'Search groups…',
  allowCustom = false,
  searchable = true,
  optionIcon,
  triggerClassName = '',
  contentClassName = '',
  showTriggerIcon = true,
  onContextMenu,
  onOpenChange,
  footer,
  triggerDetail,
  triggerContent,
  onManage,
  header,
  unselectedLabel = 'Choose a group',
}: {
  header?: ReactNode;
  onManage?: (option: GroupOption) => void;
  options: GroupOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  disabled: boolean;
  placeholder?: string;
  allowCustom?: boolean;
  searchable?: boolean;
  optionIcon?: (option: GroupOption) => ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  showTriggerIcon?: boolean;
  onContextMenu?: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  footer?: ReactNode;
  triggerDetail?: string;
  triggerContent?: ReactNode;
  unselectedLabel?: string;
}) {
  const tabs = AppManager.getAll();
  const renderIcon = (option: GroupOption) => {
    if (optionIcon) return optionIcon(option);
    if (option.leadingIcon) return option.leadingIcon;
    const group =
      option.group ||
      tabs.find(
        (tab) =>
          !tab.archived &&
          (aiGroupId(tab) === option.id ||
            groupKey(tab) === option.id ||
            loginProfileKey(tab) === option.id),
      );
    if (group) return <GroupIcon item={group} tabs={tabs} />;
    return (
      <span className="group-icon-slot" aria-hidden="true">
        <AppIcon icon={option.icon || ''} title={option.name} />
      </span>
    );
  };
  const selected = options.find((option) => option.id === value);
  const [open, setOpen] = useState(false);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const matches = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const seen = new Set<string>();
    return options.filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return `${option.name} ${option.id} ${option.detail || ''}`
        .toLocaleLowerCase()
        .includes(search);
    });
  }, [options, query]);
  const visible = matches.slice(0, 100);
  // Keep the current group reachable even when the unfiltered list is capped.
  if (
    !query.trim() &&
    selected &&
    !visible.some((option) => option.id === value)
  ) {
    if (visible.length === 100) visible[99] = selected;
    else visible.push(selected);
  }
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, active, id]);
  const choose = (next: string) => {
    if (options.find(option => option.id === next)?.disabled) return;
    onChange(next);
    setOpen(false);
    onOpenChange?.(false);
  };
  const showContext = (event: MouseEvent | KeyboardEvent, next?: string) => {
    if (!next || !onContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    onOpenChange?.(false);
    onContextMenu(next);
  };
  const contextKey = (event: KeyboardEvent, next?: string) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
      showContext(event, next);
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
        setQuery('');
        const selectedIndex = [
          ...new Set(options.map((option) => option.id)),
        ].indexOf(value);
        setActive(next ? Math.max(0, Math.min(selectedIndex, 99)) : 0);
      }}
    >
      <Popover.Trigger>
        <Button
          type="button"
          variant="soft"
          disabled={disabled}
          aria-label={label}
          onContextMenu={(event) => showContext(event, selected?.id)}
          onKeyDown={(event) => contextKey(event, selected?.id)}
          className={`group-picker-trigger ${triggerClassName}`}
          title={`${label}: ${selected?.name || value}`}
        >
          {triggerContent ||
            (selected && showTriggerIcon && renderIcon(selected))}
          {!triggerContent && (
            <>
              <span className="group-picker-label">
                {selected?.name || (allowCustom && value) || unselectedLabel}
              </span>
              {triggerDetail && (
                <span className="group-picker-detail">{triggerDetail}</span>
              )}
              <ChevronDown size={14} />
            </>
          )}
        </Button>
      </Popover.Trigger>
      <PanelPopoverContent
        className={`group-picker ${contentClassName}`}
        sideOffset={6}
      >
        {header}
        {searchable && (
          <TextField.Root
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={
              visible[active] ? `${id}-${active}` : undefined
            }
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                const index =
                  (active + direction + visible.length) %
                  Math.max(visible.length, 1);
                setActive(index);
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (visible[active]) choose(visible[active].id);
              }
            }}
          >
            <TextField.Slot>
              <Search size={15} />
            </TextField.Slot>
          </TextField.Root>
        )}
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="group-picker-results"
        >
          {visible.map((option, index) => {
            const choice = (
              <button
                key={option.id}
                type="button"
                role="option"
                disabled={option.disabled}
                id={`${id}-${index}`}
                tabIndex={searchable ? -1 : 0}
                aria-selected={option.id === value}
                title={option.hint || option.name}
                data-active={index === active || undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
                onContextMenu={(event) => showContext(event, option.id)}
                onKeyDown={(event) => contextKey(event, option.id)}
              >
                {renderIcon(option)}
                <span>
                  <strong>{option.name}</strong>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {option.id === value && <Check size={14} />}
              </button>
            );
            if (!onManage) return choice;
            return (
              <div className="group-picker-option-row" key={option.id}>
                {choice}
                {option.canManage && (
                  <button
                    type="button"
                    className="group-picker-manage"
                    aria-label={`Manage ${option.name}`}
                    title={`Manage ${option.name}`}
                    onClick={() => {
                      setOpen(false);
                      onOpenChange?.(false);
                      onManage(option);
                    }}
                  >
                    <Settings2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {allowCustom &&
          query.trim() &&
          !options.some((option) => option.id === query.trim()) && (
            <Button
              type="button"
              variant="soft"
              onClick={() => choose(query.trim())}
            >
              Use {query.trim()}
            </Button>
          )}
        {!visible.length && <p role="status">No matches</p>}
        {matches.length > visible.length && (
          <p>Showing 100 of {matches.length}. Search to narrow the list.</p>
        )}
        {footer}
      </PanelPopoverContent>
    </Popover.Root>
  );
}

GroupPicker.defaultProps = {
  placeholder: 'Search groups…',
  allowCustom: false,
  optionIcon: undefined,
  triggerClassName: '',
};
