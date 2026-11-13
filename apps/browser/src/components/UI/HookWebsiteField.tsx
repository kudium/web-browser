import { FormTextField } from './FormTextField';
import type { SiteHook } from '../../browser/siteDeveloper';
/* eslint-disable jsx-a11y/label-has-associated-control */
export function HookWebsiteField({
  sites,
  onChange,
  disabled,
}: {
  sites?: SiteHook['sites'];
  onChange: (sites: NonNullable<SiteHook['sites']>) => void;
  disabled?: boolean;
}) {
  return (
    <FormTextField
      label="Allowed websites"
      disabled={disabled}
      placeholder="All websites · or example.com, *.example.org"
      value={(sites || [])
        .map((site) => `${site.includeSubdomains ? '*.' : ''}${site.host}`)
        .join(', ')}
      onChange={(event) =>
        onChange(
          event.target.value
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .map((value) => ({
              host: value.replace(/^\*\./, ''),
              includeSubdomains: value.startsWith('*.'),
            }))
        )
      }
    />
  );
}
