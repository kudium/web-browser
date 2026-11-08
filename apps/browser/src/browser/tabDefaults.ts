import type { IApp } from '../types';
import type { BrowserState } from './contracts';

/** Ignore the temporary empty page while a restored tab starts loading. */
export function savedNavigationURL(tab: IApp, state: BrowserState): string {
  return !state.initialLoading && state.url ? state.url : tab.url;
}

/** Only destinations supported by the browser may become saved tab defaults. */
export function validTabDefaultURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value.length > 65536)
    return undefined;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function tabDefaultURL(tab: IApp): string | undefined {
  return validTabDefaultURL(tab.tabDefaultURL);
}

export function tabResumeURL(tab: IApp, currentURL?: string): string {
  return tabDefaultURL(tab) || currentURL || tab.url;
}

export function retainTabHistory(tab: IApp, groupUnload = false): boolean {
  return !groupUnload && !tabDefaultURL(tab);
}
