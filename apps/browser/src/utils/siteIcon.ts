import type { IApp } from '../types';
import { loginProfileKey } from './groups';

/** Reuse resolved website icons without issuing renderer-side favicon requests. */
export function savedSiteIcon(tabs: IApp[], url: string, profile?: string) {
  const origin = (address: string) => {
    try {
      const parsed = new URL(address);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : '';
    } catch {
      return '';
    }
  };
  const site = origin(url);
  if (!site) return undefined;
  return tabs.find(
    (tab) =>
      !!tab.icon &&
      origin(tab.url) === site &&
      (profile === undefined || loginProfileKey(tab) === profile)
  )?.icon;
}
