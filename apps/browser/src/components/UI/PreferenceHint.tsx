import { ReactNode } from 'react';
import { Popover, IconButton } from '@radix-ui/themes';
import { Info } from 'lucide-react';

export function PreferenceHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <IconButton
          type="button"
          variant="ghost"
          color="gray"
          size="1"
          aria-label={`About ${label}`}
          className="preference-hint"
        >
          <Info size={15} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content maxWidth="320px" className="preference-hint-content">
        {children}
      </Popover.Content>
    </Popover.Root>
  );
}
