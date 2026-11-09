import { ReactNode, useState, useEffect, useRef } from 'react';

type Entry = { id: string; name: string; subtitle?: string };

export function SettingsLibrary<T extends Entry>({
  entries,
  children,
  label,
  renderToolbar = undefined,
}: {
  entries: T[];
  children: (entry: T, index: number) => ReactNode;
  label: string;
  // Generic render prop uses the default parameter above.
  // eslint-disable-next-line react/require-default-props
  renderToolbar?: (entry: T | undefined) => ReactNode;
}) {
  const [selected, setSelected] = useState<string>();
  const previousIds = useRef(entries.map((entry) => entry.id));
  useEffect(() => {
    const added = [...entries]
      .reverse()
      .find((entry) => !previousIds.current.includes(entry.id));
    if (added) setSelected(added.id);
    previousIds.current = entries.map((entry) => entry.id);
  }, [entries]);
  const current = entries.find((entry) => entry.id === selected) || entries[0];
  return (
    <div className="settings-library">
      <div className="settings-library-navigation">
        <div className="settings-library-list" aria-label={label}>
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className="settings-library-item"
              aria-pressed={current?.id === entry.id}
              onClick={() => setSelected(entry.id)}
              onKeyDown={(event) => {
                const index = entries.indexOf(entry);
                let next = index;
                if (event.key === 'ArrowDown')
                  next = Math.min(index + 1, entries.length - 1);
                else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = entries.length - 1;
                else return;
                event.preventDefault();
                setSelected(entries[next].id);
                (
                  event.currentTarget.parentElement?.children[
                    next
                  ] as HTMLElement
                )?.focus();
              }}
            >
              <span>{entry.name}</span>
              {entry.subtitle && <small>{entry.subtitle}</small>}
            </button>
          ))}
          {!entries.length && <p className="empty-message">No items yet.</p>}
        </div>
        {renderToolbar && (
          <div className="settings-library-toolbar">
            {renderToolbar(current)}
          </div>
        )}
      </div>
      <div className="settings-library-detail" key={current?.id}>
        {current ? (
          children(current, entries.indexOf(current))
        ) : (
          <p className="empty-message">Add an item to get started.</p>
        )}
      </div>
    </div>
  );
}
