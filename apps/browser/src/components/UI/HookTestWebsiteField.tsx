import { FormTextField } from './FormTextField';
/* Optional props have parameter defaults; the input is nested in its label. */
/* eslint-disable react/require-default-props, jsx-a11y/label-has-associated-control */
export function HookTestWebsiteField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <FormTextField
      label="Test website URL"
      type="url"
      maxLength={4096}
      value={value}
      disabled={disabled}
      placeholder="https://example.com"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
