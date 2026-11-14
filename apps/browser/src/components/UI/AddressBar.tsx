/* The shared address input forwards its native editing handlers. */
/* eslint-disable react/jsx-props-no-spreading */
import { FormEventHandler, InputHTMLAttributes, ReactNode, useId } from 'react';
import {
  ChevronDown,
  Link,
  SlidersHorizontal,
  LockKeyholeOpen,
} from 'lucide-react';
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
}: {
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
  const extensionsId = useId();
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
    <div
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
            icon={LockKeyholeOpen}
            label="Not secure — site settings"
            className="address-insecure-indicator"
            onClick={onSiteSettings}
          />
        )}
        <FormInput
          {...inputProps}
          className="location-label"
          aria-label="Website address"
          placeholder="Search or enter URL"
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
  );
}

AddressBar.defaultProps = {
  developer: undefined,
  navigation: null,
  groupBadge: null,
  mediaControl: null,
};
