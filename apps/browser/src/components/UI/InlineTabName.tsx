import { useEffect, useRef, useState } from 'react';

export function InlineTabName({
  name,
  save,
  cancel,
}: {
  name: string;
  save: (nextName: string) => void;
  cancel: () => void;
}) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    save(value.trim());
  };
  return (
    <input
      ref={input}
      className="inline-tab-name"
      aria-label="Rename tab"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          finished.current = true;
          cancel();
        }
      }}
    />
  );
}
