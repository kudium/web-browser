import { useId } from 'react';
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
          Import folders as tab groups, and Arc or Dia spaces as folders when
          available. Turn an option off to keep the source organization.
          Imported groups share website sessions and the password manager.
        </PreferenceHint>
      </div>
      <label htmlFor={`${id}-folders`}>
        <input
          id={`${id}-folders`}
          type="checkbox"
          checked={options.foldersAsGroups}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...options, foldersAsGroups: event.target.checked })
          }
        />
        Folders as tab groups
      </label>
      {hasSpaces && (
        <label htmlFor={`${id}-spaces`}>
          <input
            id={`${id}-spaces`}
            type="checkbox"
            checked={options.spacesAsFolders}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...options, spacesAsFolders: event.target.checked })
            }
          />
          Spaces as folders
        </label>
      )}
    </div>
  );
}
