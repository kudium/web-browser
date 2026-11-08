/* Function components use parameter defaults for optional props. */
/* eslint-disable react/require-default-props */
/* Radix controls expose native labels through IDs and aria-label. */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useId } from 'react';
import { Button, Popover, Select, TextField } from '@radix-ui/themes';
import { ChevronDown, Globe2 } from 'lucide-react';

export function HookPageTarget({
  path,
  disabled,
  origin = '',
  onChange,
}: {
  path: string;
  disabled: boolean;
  origin?: string;
  onChange: (target: string) => void;
}) {
  const id = useId();
  const all = path === '/*';
  let rule = 'exact';
  if (path.includes('*')) rule = 'pattern';
  if (path.endsWith('*') && !path.slice(0, -1).includes('*')) rule = 'prefix';
  const display = rule === 'prefix' ? path.slice(0, -1) : path;
  const targetLabel = all ? 'All pages' : path;
  const compactLabel = !all && rule === 'prefix' ? `${display}…` : targetLabel;
  const host = origin ? new URL(origin).host : 'This website';
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button
          size="1"
          color="gray"
          variant="soft"
          disabled={disabled}
          className="site-hook-target-trigger"
          aria-label="Choose pages"
        >
          <Globe2 size={14} />
          <span>{compactLabel}</span>
          <ChevronDown size={12} />
        </Button>
      </Popover.Trigger>
      <Popover.Content width="320px" className="site-hook-popover">
        <div className="site-hook-popover-title">Run on</div>
        <Select.Root
          value={all ? 'all' : 'selected'}
          onValueChange={(value) =>
            onChange(
              value === 'all'
                ? '/*'
                : (origin && new URL(origin).pathname) || '/'
            )
          }
        >
          <Select.Trigger
            aria-label="Pages to match"
            style={{ width: '100%' }}
          />
          <Select.Content>
            <Select.Item value="all">All pages on this website</Select.Item>
            <Select.Item value="selected">Selected pages</Select.Item>
          </Select.Content>
        </Select.Root>
        {!all && (
          <div className="site-hook-target-fields">
            <Select.Root
              value={rule}
              onValueChange={(value) =>
                onChange(
                  value === 'prefix'
                    ? `${display.replace(/\*/g, '')}*`
                    : display.replace(/\*/g, '')
                )
              }
            >
              <Select.Trigger
                aria-label="Path matching"
                style={{ width: '100%' }}
              />
              <Select.Content>
                <Select.Item value="prefix">Path starts with</Select.Item>
                <Select.Item value="exact">Path is exactly</Select.Item>
                {rule === 'pattern' && (
                  <Select.Item value="pattern">Custom pattern</Select.Item>
                )}
              </Select.Content>
            </Select.Root>
            <label htmlFor={id}>Page path</label>
            <TextField.Root
              id={id}
              size="2"
              value={display}
              maxLength={499}
              placeholder="/account/"
              onChange={(event) =>
                onChange(
                  rule === 'prefix'
                    ? `${event.target.value}*`
                    : event.target.value
                )
              }
              autoComplete="off"
              spellCheck={false}
            />
            {!path.startsWith('/') && (
              <span role="alert" className="site-hook-path-error">
                Start the path with /.
              </span>
            )}
          </div>
        )}
        <p className="site-hook-target-preview">
          {all || !path.startsWith('/')
            ? host
            : `${host}${display}${rule === 'prefix' ? '…' : ''}`}
        </p>
        <p className="site-hook-target-caption">
          {all
            ? 'Includes every page on this website.'
            : 'Checked when a page loads. Query and hash are ignored.'}
        </p>
      </Popover.Content>
    </Popover.Root>
  );
}
