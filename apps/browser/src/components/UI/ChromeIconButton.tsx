/* Optional button attributes use native defaults and parameter defaults. */
/* eslint-disable react/require-default-props */
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Tooltip } from '@radix-ui/themes';
import type { LucideIcon } from 'lucide-react';

type ChromeIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label' | 'type'
> & {
  label: string;
  icon: LucideIcon;
};

/** Shared chrome control; forwards Radix trigger events and the native ref. */
export const ChromeIconButton = forwardRef<
  HTMLButtonElement,
  ChromeIconButtonProps
>(function ChromeIconButton(
  { label, icon: Icon, className = '', ...props },
  ref
) {
  return (
    <Tooltip content={label} collisionPadding={8}>
      <button
        // Radix supplies trigger events and ARIA attributes through this wrapper.
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
        ref={ref}
        type="button"
        aria-label={label}
        className={`chrome-icon-button ${className}`.trim()}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </Tooltip>
  );
});
