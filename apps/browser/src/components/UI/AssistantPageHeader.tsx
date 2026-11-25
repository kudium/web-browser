import { PanelDockButton } from './PanelDockButton';
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
  edgeToEdge = false,
}: {
  children?: ReactNode;
  className?: string;
  hidden?: boolean;
  /** Use in pages whose content extends beyond the sidebar's normal inset. */
  edgeToEdge?: boolean;
}) {
  const placement = useContext(AssistantPanelWindowContext);
  const { title, floating, toggle } = placement || {};
  return (
    <div className={`assistant-page-header${edgeToEdge ? ' assistant-page-header-edge' : ''} ${className}`} hidden={hidden}>
      <div className="assistant-page-header-actions">{children}</div>
      {placement && !floating && <PanelDockButton />}
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
