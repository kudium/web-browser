/* eslint-disable react/require-default-props */
import { ReactNode, useContext } from 'react';
import { ArrowUpRight, SquareArrowDownLeft } from 'lucide-react';
import { AssistantPanelWindowContext } from './AssistantPanelContext';
import { ChromeIconButton } from './ChromeIconButton';

/** One toolbar for page actions and window placement in either host. */
export function AssistantPageHeader({
  children,
  className = '',
  hidden = false,
}: {
  children?: ReactNode;
  className?: string;
  hidden?: boolean;
}) {
  const placement = useContext(AssistantPanelWindowContext);
  const { title, floating, toggle } = placement || {};
  return (
    <div className={`assistant-page-header ${className}`} hidden={hidden}>
      <div className="assistant-page-header-actions">{children}</div>
      {placement && (
        <ChromeIconButton
          label={floating ? `Dock ${title} back` : `Undock ${title}`}
          icon={floating ? SquareArrowDownLeft : ArrowUpRight}
          onClick={toggle}
        />
      )}
    </div>
  );
}
