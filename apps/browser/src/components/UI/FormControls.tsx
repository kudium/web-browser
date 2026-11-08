/* eslint-disable react/jsx-props-no-spreading -- Shared native-input primitive forwards standard attributes. */
import { forwardRef, InputHTMLAttributes, Ref } from 'react';
import { Search } from 'lucide-react';

export const FormInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>((props, ref) => (
  // Forward native input attributes and event handlers through this shared primitive.
  <input
    {...props}
    ref={ref}
    className={`form-control-input ${props.className || ''}`}
  />
));
FormInput.displayName = 'FormInput';

export function SearchControl({
  label,
  value,
  onChange,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  inputRef: Ref<HTMLInputElement>;
}) {
  return (
    <div className="form-control-surface search-control">
      <Search size={16} aria-hidden="true" />
      <FormInput
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder="Search…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="form-control-surface select-control"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
