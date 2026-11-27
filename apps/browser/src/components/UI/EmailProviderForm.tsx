import { useId, useMemo, useState } from 'react';
import { Button, Text } from '@radix-ui/themes';
import { ExternalLink, Loader2 } from 'lucide-react';
import { FormTextField } from './FormTextField';
import {
  emailProvider,
  emailProviders,
  type EmailProviderDescriptor,
  type EmailProviderKind,
  type EmailStatus,
} from '../../browser/email';

type Values = Record<string, string>;

function defaults(descriptor: EmailProviderDescriptor | undefined): Values {
  const values: Values = {};
  descriptor?.fields.forEach((field) => {
    values[field.key] = field.defaultValue || '';
  });
  return values;
}

/** Labeled native select styled like the shared text fields; keyboard and VoiceOver friendly. */
export function EmailFieldSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="app-form-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="email-select" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface Choice {
  value: string;
  label: string;
  providerId: string;
  presetId?: string;
  disabled?: boolean;
}

/** Every provider and preset flattened into one list, e.g. Google, iCloud Mail, Another IMAP server. */
function choicesFor(kind: EmailProviderKind, unavailable: string[]): Choice[] {
  return emailProviders(kind).flatMap((provider): Choice[] => {
    const disabled = unavailable.includes(provider.id);
    const label = disabled ? `${provider.label} (not set up in this build)` : provider.label;
    if (!provider.presets) return [{ value: provider.id, label, providerId: provider.id, disabled }];
    return [
      ...provider.presets.map((preset) => ({ value: `${provider.id}:${preset.id}`, label: preset.label, providerId: provider.id, presetId: preset.id })),
      { value: `${provider.id}:custom`, label: 'Another IMAP server', providerId: provider.id, presetId: 'custom' },
    ];
  });
}

/** One compact form: a single service choice, then a sign-in button or only the fields that service needs. */
export function EmailProviderForm({
  kind,
  busy,
  status,
  onSubmit,
  onCancel,
  onCancelSignIn,
}: {
  kind: EmailProviderKind;
  busy: boolean;
  status?: EmailStatus;
  onSubmit: (providerId: string, values: Values) => void;
  onCancel: () => void;
  onCancelSignIn: () => void;
}) {
  const choices = useMemo(() => choicesFor(kind, status?.unavailable || []), [kind, status?.unavailable]);
  const [choiceValue, setChoiceValue] = useState(() => (choices.find((item) => !item.disabled) || choices[0])?.value || '');
  const choice = choices.find((item) => item.value === choiceValue) || choices[0];
  const descriptor = emailProvider(choice?.providerId);
  const preset = descriptor?.presets?.find((item) => item.id === choice?.presetId);
  const [values, setValues] = useState<Values>(() => ({ ...defaults(descriptor), ...(preset?.values || {}) }));
  const oauth = descriptor?.auth === 'oauth';
  const signingIn = !!status?.connecting && status.connecting === descriptor?.id;
  const hint = preset?.hint || descriptor?.fields.find((field) => field.secret)?.hint;
  const description = kind === 'alias' || preset ? undefined : descriptor?.description;
  const fields = descriptor?.fields.filter((field) => !preset || !(field.key in preset.values) || preset.editableFields?.includes(field.key)) || [];
  const renderField = (field: typeof fields[number]) => <FormTextField key={field.key} label={field.label}
    type={field.kind === 'password' ? 'password' : field.kind === 'number' ? 'number' : 'text'}
    value={values[field.key] || ''} placeholder={field.placeholder} required={field.required} autoComplete="off" spellCheck={false} disabled={busy}
    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />;
  return (
    <form
      className="email-provider-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (descriptor && !signingIn) onSubmit(descriptor.id, values);
      }}
    >
      {choices.length > 1 && (
        <EmailFieldSelect
          label="Service"
          disabled={busy}
          value={choice?.value || ''}
          onChange={(next) => {
            const selected = choices.find((item) => item.value === next);
            const nextDescriptor = emailProvider(selected?.providerId);
            const nextPreset = nextDescriptor?.presets?.find((item) => item.id === selected?.presetId);
            setChoiceValue(next);
            setValues({ ...defaults(nextDescriptor), ...(nextPreset?.values || {}) });
          }}
          options={choices.map(({ value, label }) => ({ value, label }))}
        />
      )}
      {description && (
        <Text as="p" size="1" className="email-provider-hint">
          {description}
        </Text>
      )}
      {oauth && signingIn && (
        <div className="email-signin-waiting" role="status">
          <Loader2 size={14} aria-hidden="true" />
          Finish signing in to {descriptor?.label} in the tab that opened.
        </div>
      )}
      {!oauth && fields.filter((field) => !field.advanced).map(renderField)}
      {!oauth && fields.some((field) => field.advanced) && <details className="email-advanced-settings">
        <summary>Custom server</summary>
        <div>{fields.filter((field) => field.advanced).map(renderField)}</div>
      </details>}
      {!oauth && (hint || descriptor?.website) && (
        <Text as="p" size="1" className="email-provider-hint">
          {hint}
          {descriptor?.website && (
            <>
              {hint ? ' ' : ''}
              <a href={descriptor.website} target="_blank" rel="noreferrer">
                {kind === 'alias' ? 'Get API key' : `Open ${descriptor.label}`}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            </>
          )}
        </Text>
      )}
      <div className="email-dialog-footer">
        <Button
          type="button"
          size="2"
          variant="soft"
          color="gray"
          disabled={busy && !signingIn}
          onClick={signingIn ? onCancelSignIn : onCancel}
        >
          Cancel
        </Button>
        {oauth ? (
          <Button type="submit" size="2" disabled={busy || !descriptor || !!choice?.disabled}>
            {signingIn ? 'Waiting…' : `Sign in with ${descriptor?.label}`}
          </Button>
        ) : (
          <Button type="submit" size="2" disabled={busy || !descriptor}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        )}
      </div>
    </form>
  );
}
