import { AlertDialog, Button, Checkbox, Text } from '@radix-ui/themes';

export function BulkActions({
  ids,
  selected,
  onSelect,
  onRemove,
  action,
  description,
}: {
  ids: string[];
  selected: string[];
  onSelect: (values: string[]) => void;
  onRemove: (values: string[]) => void;
  action: string;
  description: string;
}) {
  const targets = selected.filter((id) => ids.includes(id));
  let checked: boolean | 'indeterminate' = false;
  if (targets.length)
    checked = targets.length === ids.length || 'indeterminate';
  if (!ids.length) return null;
  return (
    <div className="workspace-bulk-actions">
      <Text as="label" size="2">
        <Checkbox
          aria-label="Select all"
          checked={checked}
          onCheckedChange={(value) => onSelect(value ? ids : [])}
        />{' '}
        {targets.length ? `${targets.length} selected` : 'Select all'}
      </Text>
      <AlertDialog.Root>
        <AlertDialog.Trigger>
          <Button variant="soft" color="red" disabled={!targets.length}>
            {action} selected…
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Content maxWidth="400px">
          <AlertDialog.Title>
            {action} {targets.length} {targets.length === 1 ? 'item' : 'items'}?
          </AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color="red"
                onClick={() => {
                  onRemove(targets);
                  onSelect([]);
                }}
              >
                {action} {targets.length}{' '}
                {targets.length === 1 ? 'item' : 'items'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}
