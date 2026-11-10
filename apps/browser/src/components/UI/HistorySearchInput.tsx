import { TextField } from '@radix-ui/themes';
import { Search } from 'lucide-react';

export function HistorySearchInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField.Root
      className="history-search-input"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <TextField.Slot>
        <Search size={14} aria-hidden="true" />
      </TextField.Slot>
    </TextField.Root>
  );
}
