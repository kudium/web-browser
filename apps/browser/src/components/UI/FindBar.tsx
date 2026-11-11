import { IconButton, TextField, Button } from '@radix-ui/themes';
import { ArrowDown, Search, Sparkles, X } from 'lucide-react';

export function FindBar({
  value,
  onChange,
  onNext,
  onClose,
  onSearchAI,
}: {
  value: string;
  onChange: (text: string) => void;
  onNext: () => void;
  onClose: () => void;
  onSearchAI: (query: string) => void;
}) {
  const query = value.trim();
  return (
    <form
      className="find-bar"
      role="search"
      aria-label="Find on page"
      onSubmit={(event) => {
        event.preventDefault();
        if (query) onNext();
      }}
    >
      <TextField.Root
        size="2"
        autoFocus
        aria-label="Find in page"
        placeholder="Find in page…"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <TextField.Slot>
          <Search size={15} />
        </TextField.Slot>
      </TextField.Root>
      <IconButton
        size="1"
        variant="ghost"
        type="submit"
        disabled={!query}
        aria-label="Next match"
        title="Next match (Enter)"
      >
        <ArrowDown size={16} />
      </IconButton>
      <span className="find-bar-divider" aria-hidden="true" />
      <Button
        size="1"
        variant="soft"
        type="button"
        disabled={!query}
        onClick={() => onSearchAI(query)}
      >
        <Sparkles size={14} /> Search with AI
      </Button>
      <IconButton
        size="1"
        variant="ghost"
        type="button"
        aria-label="Close find"
        title="Close (Esc)"
        onClick={onClose}
      >
        <X size={16} />
      </IconButton>
    </form>
  );
}
