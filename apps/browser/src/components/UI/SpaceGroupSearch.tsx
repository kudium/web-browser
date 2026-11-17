import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export function SpaceGroupSearch({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLButtonElement>(null);
  const searching = value !== null;
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);
  const close = () => {
    onChange(null);
    requestAnimationFrame(() => title.current?.focus());
  };
  if (!searching)
    return (
      <button
        ref={title}
        type="button"
        className="space-title-search"
        aria-label={`Search ${name}`}
        title={`Search tabs and groups in ${name}`}
        onClick={() => onChange('')}
      >
        <span className="space-search-icon" aria-hidden="true">
          <Search size={16} />
        </span>
        <span className="space-title-name">Search {name}</span>
      </button>
    );
  return (
    <div className="space-group-search">
      <span className="space-search-icon" aria-hidden="true">
        <Search size={16} />
      </span>
      <input
        ref={input}
        type="search"
        aria-label={`Search ${name}`}
        aria-controls="space-group-list"
        placeholder={`Search ${name}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!value) onChange(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      />
      <button
        type="button"
        aria-label={value ? 'Clear group search' : 'Close group search'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (value) {
            onChange('');
            input.current?.focus();
          } else close();
        }}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
