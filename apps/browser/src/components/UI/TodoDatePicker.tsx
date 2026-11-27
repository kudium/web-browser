import { useState } from 'react';
import { Popover } from '@radix-ui/themes';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { localDay } from '../../browser/todos';
import { PanelPopoverContent } from './PanelDialog';

export function TodoDatePicker({
  title,
  date,
  disabled,
  onSave,
}: {
  title: string;
  date?: string;
  disabled: boolean;
  onSave: (date: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(date || '');
  const [month, setMonth] = useState(new Date());
  const today = localDay();
  const offset = (days: number) => {
    const next = new Date();
    next.setDate(next.getDate() + days);
    return localDay(next);
  };
  const label = !date
    ? 'Set date'
    : date === today
      ? 'Today'
      : date === offset(1)
        ? 'Tomorrow'
        : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            ...(date.slice(0, 4) !== today.slice(0, 4)
              ? { year: 'numeric' as const }
              : {}),
          });
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const first = new Date(start);
  first.setDate(1 - start.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next && disabled) return;
        if (next) {
          setSelected(date || '');
          setMonth(date ? new Date(`${date}T12:00:00`) : new Date());
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger>
        <button
          className="todo-date-trigger"
          data-scheduled={!!date}
          disabled={disabled}
          aria-label={`Set date for ${title}`}
          title={date ? `Scheduled for ${date}` : 'Set date'}
        >
          <CalendarDays size={14} />
          {date && <span>{label}</span>}
        </button>
      </Popover.Trigger>
      <PanelPopoverContent
        className="todo-date-popover"
        size="1"
        aria-label={`Schedule ${title}`}
      >
        <div className="todo-date-shortcuts">
          {[
            ['Today', 0],
            ['Tomorrow', 1],
            ['Next week', 7],
          ].map(([label, offsetDays]) => (
            <button
              key={label}
              onClick={() => {
                const date = offset(Number(offsetDays));
                setSelected(date);
                setMonth(new Date(`${date}T12:00:00`));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="todo-date-month">
          <strong>
            {start.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </strong>
          <button
            aria-label="Previous month"
            onClick={() =>
              setMonth(
                new Date(month.getFullYear(), month.getMonth() - 1, 1, 12),
              )
            }
          >
            <ChevronLeft size={15} />
          </button>
          <button
            aria-label="Next month"
            onClick={() =>
              setMonth(
                new Date(month.getFullYear(), month.getMonth() + 1, 1, 12),
              )
            }
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <div
          className="todo-date-calendar"
          role="group"
          aria-label="Choose date"
        >
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
            <span aria-hidden="true" key={index}>
              {label}
            </span>
          ))}
          {days.map((day) => {
            const key = localDay(day);
            return (
              <button
                key={key}
                aria-label={key}
                aria-pressed={selected === key}
                data-outside={day.getMonth() !== start.getMonth()}
                data-today={key === today}
                onClick={() => setSelected(key)}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        <div className="todo-date-footer">
          <button
            disabled={disabled}
            onClick={async () => {
              if (await onSave('')) setOpen(false);
            }}
          >
            Clear
          </button>
          <button
            className="todo-date-apply"
            disabled={!selected || disabled}
            onClick={async () => {
              if (await onSave(selected)) setOpen(false);
            }}
          >
            Apply
          </button>
        </div>
      </PanelPopoverContent>
    </Popover.Root>
  );
}
