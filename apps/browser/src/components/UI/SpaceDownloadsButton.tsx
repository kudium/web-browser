import { IconButton } from '@radix-ui/themes';
import { ArrowDownToLine } from 'lucide-react';
import type { DownloadRecord } from '../../browser/downloads';

export function SpaceDownloadsButton({
  records,
  onOpen,
}: {
  records: DownloadRecord[];
  onOpen: () => void;
}) {
  const active = records.filter((record) => record.active);
  if (!active.length && !records.some((record) => record.state === 'completed'))
    return null;
  const unknown = active.some(
    (record) => record.totalBytes <= 0 || record.receivedBytes === 0
  );
  const total = active.reduce((sum, record) => sum + record.totalBytes, 0);
  const received = active.reduce(
    (sum, record) => sum + Math.min(record.receivedBytes, record.totalBytes),
    0
  );
  const progress = total > 0 ? Math.max(0, Math.min(1, received / total)) : 0;
  const running = active.some((record) => !record.paused);
  const label = active.length
    ? `Downloads — ${active.length} active${
        unknown ? '' : `, ${Math.round(progress * 100)}%`
      }${running ? '' : ', paused'}`
    : 'Downloads';
  return (
    <IconButton
      size="1"
      variant="ghost"
      className="space-downloads-button"
      aria-label={label}
      title={label}
      onClick={onOpen}
    >
      <ArrowDownToLine size={14} aria-hidden="true" />
      {active.length > 0 && (
        <svg
          className="space-downloads-progress"
          data-indeterminate={unknown && running ? true : undefined}
          viewBox="0 0 28 28"
          aria-hidden="true"
        >
          <circle className="space-downloads-track" cx="14" cy="14" r="11" />
          <circle
            cx="14"
            cy="14"
            r="11"
            pathLength="100"
            strokeDasharray={`${unknown ? 25 : progress * 100} 100`}
          />
        </svg>
      )}
    </IconButton>
  );
}
