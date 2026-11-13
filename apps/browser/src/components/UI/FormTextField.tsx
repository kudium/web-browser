import { useId, type ComponentProps } from 'react';
import { TextField } from '@radix-ui/themes';

type Props = ComponentProps<typeof TextField.Root> & { label?: string };
/* eslint-disable react/require-default-props */
export function FormTextField({ label, id, ...props }: Props) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const control = (
    <TextField.Root
      {...props}
      id={inputId}
      className={`app-form-input ${props.className || ''}`}
    />
  );
  return label ? (
    <div className="app-form-field">
      <label htmlFor={inputId}>{label}</label>
      {control}
    </div>
  ) : (
    control
  );
}
