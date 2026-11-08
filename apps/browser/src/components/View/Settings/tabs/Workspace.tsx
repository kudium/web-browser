import { SegmentedControl } from '@radix-ui/themes';
import { ManageApp } from './ManageApp';
import { Spaces } from './Spaces';
import { Archive } from './Archive';

export function Workspace({
  tab,
  onTabChange,
}: {
  tab: string;
  onTabChange: (value: string) => void;
}) {
  return (
    <div className="workspace-settings">
      <SegmentedControl.Root
        value={tab}
        onValueChange={onTabChange}
        aria-label="Workspace management"
      >
        <SegmentedControl.Item value="apps">Groups</SegmentedControl.Item>
        <SegmentedControl.Item value="spaces">Spaces</SegmentedControl.Item>
        <SegmentedControl.Item value="archive">Archive</SegmentedControl.Item>
      </SegmentedControl.Root>
      {tab === 'apps' && <ManageApp />}
      {tab === 'spaces' && <Spaces />}
      {tab === 'archive' && <Archive />}
    </div>
  );
}
