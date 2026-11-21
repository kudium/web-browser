/* Optional content is supplied by each feature; presentation stays shared. */
/* eslint-disable react/require-default-props */
import { ReactNode } from 'react';
import { Button } from '@radix-ui/themes';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={`feature-empty-state ${className}`}>
      {icon && (
        <span className="feature-empty-state-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button type="button" variant="soft" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
