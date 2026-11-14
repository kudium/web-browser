/* Optional button attributes use native defaults and parameter defaults. */
/* eslint-disable react/require-default-props */
import { ButtonHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { browser } from '../../browser/client';

type ChromeIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label' | 'type'
> & {
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  text?: string;
};

/** Shared chrome control; forwards Radix trigger events and the native ref. */
export const ChromeIconButton = forwardRef<
  HTMLButtonElement,
  ChromeIconButtonProps
>(function ChromeIconButton(
  { label, icon: Icon, className = '', badgeCount = 0, text, ...props },
  ref
) {
  const tooltipId = useRef<string | undefined>(undefined);
  if (!tooltipId.current) tooltipId.current = crypto.randomUUID();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hide = () => {
    clearTimeout(timer.current);
    try {
      browser.tooltip?.({ id: tooltipId.current! }).catch(() => {});
    } catch {
      /* No tooltip bridge in an isolated host. */
    }
  };
  const show = (button: HTMLButtonElement) => {
    clearTimeout(timer.current);
    if (button.disabled) return;
    if (button.ownerDocument !== document) {
      button.title = label;
      return;
    }
    timer.current = setTimeout(() => {
      if (!button.isConnected) return;
      const rect = button.getBoundingClientRect();
      browser
        .tooltip?.({
          id: tooltipId.current!,
          label,
          anchor: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          dark: !!button.closest('.dark, .dark-theme'),
        })
        .catch(() => {});
    }, 500);
  };
  useEffect(() => hide, [label, props.disabled]);
  return (
    <button
      // Radix supplies trigger events and ARIA attributes through this wrapper.
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...props}
      ref={ref}
      type="button"
      aria-label={label}
      className={`chrome-icon-button ${className}`.trim()}
      onPointerEnter={(event) => {
        props.onPointerEnter?.(event);
        show(event.currentTarget);
      }}
      onPointerLeave={(event) => {
        props.onPointerLeave?.(event);
        hide();
      }}
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        hide();
      }}
      onFocus={(event) => {
        props.onFocus?.(event);
        show(event.currentTarget);
      }}
      onBlur={(event) => {
        props.onBlur?.(event);
        hide();
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.key === 'Escape') hide();
      }}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {text && <span className="chrome-button-text">{text}</span>}
      {badgeCount > 0 && (
        <span className="ai-count-badge" aria-hidden="true">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  );
});
