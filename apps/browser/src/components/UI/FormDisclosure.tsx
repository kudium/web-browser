import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
/* eslint-disable react/require-default-props */
export function FormDisclosure({
  title,
  summary,
  children,
  lazy = false,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  lazy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <section className="app-form-disclosure">
      <button
        type="button"
        className="app-form-disclosure-toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight size={14} aria-hidden="true" data-open={open} />
        <span>{title}</span>
        {summary && (
          <span className="app-form-disclosure-summary">{summary}</span>
        )}
      </button>
      <div id={contentId} className="app-form-disclosure-content" hidden={!open}>
        {(!lazy || open) && children}
      </div>
    </section>
  );
}
