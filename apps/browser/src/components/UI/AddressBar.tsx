/* The shared address input forwards its native editing handlers. */
/* eslint-disable react/jsx-props-no-spreading */
import { FormEventHandler, InputHTMLAttributes, ReactNode, useId } from 'react';
import { ChevronDown, Link, SlidersHorizontal } from 'lucide-react';
import { FormInput } from './FormControls';
import type { SiteDeveloperState } from '../../browser/siteDeveloper';
import { ChromeIconButton } from './ChromeIconButton';

export function AddressBar({
  placement,
  inputProps,
  onSubmit,
  onCopy,
  onSiteSettings,
  toolsDisabled,
  developer,
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
  expanded: boolean;
  onToggleExtensions: () => void;
  extensions: ReactNode;
  tools: ReactNode;
  navigation?: ReactNode;
  groupBadge?: ReactNode;
  mediaControl?: ReactNode;
}) {
  const extensionsId = useId();
  return (
    <div
      className="address-bar form-control-surface"
      data-placement={placement}
    >
      {navigation && <div className="address-navigation">{navigation}</div>}
      <form className="address-bar-input" onSubmit={onSubmit}>
        {groupBadge}
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
                developer?.config.enabled
                  ? `Site settings — developer hooks ${developer.status}`
                  : 'Site settings'
              }
              onClick={onSiteSettings}
              disabled={toolsDisabled}
            />
            {developer?.config.enabled && (
              <span
                className="address-developer-badge"
                data-status={developer.status}
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
