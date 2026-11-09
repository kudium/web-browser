/* eslint-disable jsx-a11y/label-has-associated-control -- Radix Checkbox renders the control referenced by htmlFor. */
import { useId } from 'react';
import { Checkbox } from '@radix-ui/themes';
import { PreferenceHint } from '../../UI/PreferenceHint';
import type { ImportOrganizationOptions } from '../../../browser/importWorkspace';

export function ImportOrganizationChoices({
  source,
  options,
  onChange,
  disabled,
}: {
  source: string;
  options: ImportOrganizationOptions;
  onChange: (value: ImportOrganizationOptions) => void;
  disabled: boolean;
}) {
  const id = useId();
  if (!source) return null;
  const hasSpaces = source === 'Arc' || source === 'Dia';
  return (
    <div className="migration-data-choices">
      <div className="migration-organization-heading">
        <strong>Organization</strong>
        <PreferenceHint label="import organization">
          Import folders as tab groups, and Arc or Dia spaces as collections when
          available. Turn an option off to keep the source organization.
          Imported groups share website sessions and the password manager.
        </PreferenceHint>
      </div>
      <label htmlFor={`${id}-folders`}>
        <Checkbox
          id={`${id}-folders`}
          checked={options.foldersAsGroups}
          disabled={disabled}
          onCheckedChange={(value) =>
            onChange({ ...options, foldersAsGroups: value === true })
          }
        />
        Folders as tab groups
      </label>
      {hasSpaces && (
        <label htmlFor={`${id}-spaces`}>
          <Checkbox
            id={`${id}-spaces`}
            checked={options.spacesAsFolders}
            disabled={disabled}
            onCheckedChange={(value) =>
              onChange({ ...options, spacesAsFolders: value === true })
            }
          />
          Spaces as collections
        </label>
      )}
    </div>
  );
}
