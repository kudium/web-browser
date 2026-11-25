import { matchNavigationTabs, navigationSuggestionTitle } from '../../utils/navigationSuggestions';
import { cachedSearchEngines } from '../../utils/navigation';
import { matchSearchEngines, searchUrl, validateSearchEngines, type SearchEngine } from '../../browser/searchEngines';
/* The shared address input forwards its native editing handlers. */
/* eslint-disable react/jsx-props-no-spreading */
import { FormEventHandler, InputHTMLAttributes, ReactNode, useId, useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  History,
  Globe,
  ChevronDown,
  Link,
  SlidersHorizontal,
  LockOpen,
} from 'lucide-react';
import { Popover } from '@radix-ui/themes';
import { browser } from '../../browser/client';
import { historySuggestions } from '../../utils/historySuggestions';
import type { HistoryRecord } from '../../browser/history';
import type { IApp } from '../../types';
import { FormInput } from './FormControls';
import type { SiteDeveloperState } from '../../browser/siteDeveloper';
import { websiteThemeStyle } from '../../utils/websiteTheme';
import { ChromeIconButton } from './ChromeIconButton';

export function AddressBar({
  placement,
  inputProps,
  onSubmit,
  onCopy,
  onSiteSettings,
  toolsDisabled,
  developer,
  insecure,
  themeColor,
  expanded,
  onToggleExtensions,
  extensions,
  tools,
  navigation,
  groupBadge,
  mediaControl,
  suggestionTabs = [],
  onSuggestionTab,
  onSuggestionNavigate,
  hiddenHistoryProfiles,
  privateMode = false,
  onChat,
  onNewGroup,
  onMoreActions,
  onEditValue,
}: {
  suggestionTabs?: IApp[];
  onSuggestionTab?: (tab: IApp) => void;
  onSuggestionNavigate?: (value: string) => void;
  hiddenHistoryProfiles?: Set<string>;
  privateMode?: boolean;
  onChat?: (text:string) => void;
  onNewGroup?: (text:string) => void;
  onMoreActions?: (text:string) => void;
  onEditValue?: (text:string) => void;
  placement: 'sidebar' | 'header';
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCopy: () => void;
  onSiteSettings: () => void;
  toolsDisabled: boolean;
  developer?: SiteDeveloperState;
  insecure?: boolean;
  themeColor?: string;
  expanded: boolean;
  onToggleExtensions: () => void;
  extensions: ReactNode;
  tools: ReactNode;
  navigation?: ReactNode;
  groupBadge?: ReactNode;
  mediaControl?: ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const extensionsId = useId();
  const suggestionsId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [engines, setEngines] = useState(cachedSearchEngines);
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    if (!suggestionsOpen || privateMode) { setHistory([]); return undefined; }
    let live = true;
    let changed = false;
    void browser.preferences('get').then(prefs => setEngines(validateSearchEngines(prefs.searchEngines))).catch(() => {});
    const stop = browser.onHistory(records => { changed = true; if (live) setHistory(records); });
    void browser.history('get').then(records => { if (live && !changed) setHistory(records); }).catch(() => {});
    return () => { live = false; stop(); };
  }, [suggestionsOpen, privateMode]);
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const tabs = engine ? [] : matchNavigationTabs(suggestionTabs, query, 4);
    const records = privateMode || engine ? [] : historySuggestions(history, query, { excludedURLs: tabs.map(tab => tab.url), hiddenProfiles: hiddenHistoryProfiles });
    return [
      { id:'typed', title:engine ? `Search ${engine.name} for “${query}”` : navigationSuggestionTitle(query), detail:engine ? engine.name : 'Current tab', icon:Search, run:() => onSuggestionNavigate?.(engine ? searchUrl(engine, query) : query) },
      ...tabs.map(tab => ({ id:`tab-${tab.id}`, title:tab.customName || tab.name, detail:`${tab.favorite ? 'Bookmark' : 'Open tab'} · ${tab.url}`, icon:Globe, run:() => onSuggestionTab?.(tab) })),
      ...(!engine ? matchSearchEngines(engines, query).slice(0,2).map(item => ({ id:`engine-${item.id}`, title:`Search ${item.name}`, detail:`${item.keyword || item.name} · Tab to search`, icon:Search, run:() => { setEngine(item); setQuery(''); onEditValue?.(''); setSuggestionsOpen(false); } })) : []),
      ...records.map(record => ({ id:`history-${record.id}`, title:record.title || record.url, detail:`History · ${record.url}`, icon:History, run:() => onSuggestionNavigate?.(record.url) })),
    ].slice(0, 8);
  }, [query, suggestionTabs, history, hiddenHistoryProfiles, privateMode, onSuggestionNavigate, onSuggestionTab, engines, engine, onEditValue]);
  useEffect(() => {
    if (suggestionsOpen) document.getElementById(`${suggestionsId}-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted, suggestionsOpen, suggestionsId]);
  const choose = (index: number) => { const match = matches[index]; if (!match) return; setSuggestionsOpen(false); if (!match.id.startsWith('engine-')) inputRef.current?.blur(); match.run(); };

  const hasHookContent = (hook: {
    before: string;
    after: string;
    css: string;
    actions?: unknown[];
  }) =>
    !!hook.actions?.length ||
    [hook.before, hook.after, hook.css].some((code) => !!code.trim());
  const hasEnabledHooks =
    !!developer?.globalHookCount ||
    !!(
      developer?.config.enabled &&
      ((developer.config.defaultEnabled !== false &&
        hasHookContent(developer.config)) ||
        developer.config.hooks?.some(
          (hook) => hook.enabled && hasHookContent(hook)
        ))
    );
  return (
    <Popover.Root open={suggestionsOpen && matches.length > 0} onOpenChange={setSuggestionsOpen} modal={false}>
    <Popover.Anchor virtualRef={anchor} />
    <div
      ref={anchor}
      className="address-bar form-control-surface"
      data-placement={placement}
      data-website-color={
        (!!websiteThemeStyle(themeColor) && !insecure) || undefined
      }
      style={insecure ? undefined : websiteThemeStyle(themeColor)}
      data-insecure={insecure || undefined}
    >
      {navigation && <div className="address-navigation">{navigation}</div>}
      <form className="address-bar-input" onSubmit={onSubmit}>
        {groupBadge}
        {insecure && (
          <ChromeIconButton
            icon={LockOpen}
            label="Not secure — site settings"
            className="address-insecure-indicator"
            onClick={onSiteSettings}
          />
        )}
        <FormInput
          {...inputProps}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen && matches.length > 0}
          aria-controls={suggestionsId}
          aria-activedescendant={suggestionsOpen && matches[highlighted] ? `${suggestionsId}-${highlighted}` : undefined}
          onChange={event => {
            inputProps.onChange?.(event);
            setQuery(event.target.value); setHighlighted(0);
            setSuggestionsOpen(!!event.target.value.trim() && !!onSuggestionNavigate);
          }}
          onBlur={event => { if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.address-suggestions')) return; setSuggestionsOpen(false); inputProps.onBlur?.(event); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Tab' && suggestionsOpen) {
              const candidate = matchSearchEngines(engines, query)[0];
              if (candidate && !engine) { event.preventDefault(); setEngine(candidate); setQuery(''); onEditValue?.(''); return; }
            }
            if (event.key === 'Backspace' && engine && !query) { setEngine(null); }

            if (suggestionsOpen && matches.length) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); setHighlighted(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length); return;
              }
              if (event.key === 'Enter') { event.preventDefault(); choose(Math.min(highlighted, matches.length - 1)); return; }
              if (event.key === 'Escape') { event.preventDefault(); setSuggestionsOpen(false); return; }
            }
            inputProps.onKeyDown?.(event);
          }}
          className="location-label"
          aria-label="Website address"
          placeholder={engine ? `Search ${engine.name}…` : "Search or enter URL"}
          autoComplete="off"
          spellCheck={false}
        />
        {mediaControl}
        <ChromeIconButton
          icon={Link}
          label="Copy current URL"
          onClick={onCopy}
          disabled={toolsDisabled}
        />
        <div
          className="address-bar-settings"
          role="group"
          aria-label="Address bar controls"
        >
          <span className="address-site-settings-button">
            <ChromeIconButton
              icon={SlidersHorizontal}
              label={
                hasEnabledHooks
                  ? `Site settings — developer hooks ${developer.status}`
                  : 'Site settings'
              }
              onClick={onSiteSettings}
              disabled={toolsDisabled}
            />
            {hasEnabledHooks && (
              <span
                className="address-developer-badge"
                data-status={developer?.status}
                aria-hidden="true"
              />
            )}
          </span>
          <ChromeIconButton
            icon={ChevronDown}
            className="address-bar-expand"
            label="Toggle address bar extensions"
            aria-expanded={expanded}
            aria-controls={extensionsId}
            onClick={onToggleExtensions}
          />
        </div>
      </form>
      <div
        id={extensionsId}
        className="address-bar-extensions"
        hidden={!expanded}
      >
        {expanded && extensions}
      </div>
      {tools && (
        <div
          className="address-bar-tools"
          role="group"
          aria-label="Browser tools"
        >
          {tools}
        </div>
      )}
    </div>
    <Popover.Content className="address-suggestions" data-placement={placement} side="bottom" align="start" sideOffset={6} collisionPadding={8}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => { if (event.target instanceof Element && event.target.closest('.address-bar')) event.preventDefault(); }}>
      <div id={suggestionsId} role="listbox" aria-label="Address suggestions">
        {matches.map((match, index) => <div key={match.id} className="address-suggestion-row" data-chat={index === 0 && !!onChat || undefined}>
          <button id={`${suggestionsId}-${index}`} type="button" role="option" aria-selected={index === highlighted}
            onPointerDown={event => event.preventDefault()} onMouseEnter={() => setHighlighted(index)} onClick={() => choose(index)}>
            <match.icon size={16} aria-hidden="true" /><span><strong>{match.title}</strong><small>{match.detail}</small></span>
          </button>
          {index === 0 && onChat && <button type="button" className="address-suggestion-chat" onPointerDown={event=>event.preventDefault()} onClick={()=>{const text=query;setSuggestionsOpen(false);inputRef.current?.blur();onChat(text);}}>Chat</button>}
        </div>)}
      </div>
      <div className="address-suggestion-actions">
        {onNewGroup && <button type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>{const text=engine?searchUrl(engine,query):query;setSuggestionsOpen(false);inputRef.current?.blur();onNewGroup(text);}}>New group</button>}
        {onMoreActions && <button type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>{const text=query;setSuggestionsOpen(false);inputRef.current?.blur();onMoreActions(text);}}>More actions</button>}
      </div>
    </Popover.Content>
    </Popover.Root>
  );
}

AddressBar.defaultProps = {
  developer: undefined,
  navigation: null,
  groupBadge: null,
  mediaControl: null,
};
