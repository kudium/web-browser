import { Button } from '@radix-ui/themes';

export function LibraryHeader({
  count,
  noun,
  disabled,
  onClear,
}: {
  count: number;
  noun: string;
  disabled: boolean;
  onClear: () => void;
}) {
  return (
    <header className="library-panel-header">
      <span>
        {count} {noun}
        {count === 1 ? '' : 's'}
      </span>
      <Button size="1" variant="ghost" disabled={disabled} onClick={onClear}>
        Clear history
      </Button>
    </header>
  );
}
