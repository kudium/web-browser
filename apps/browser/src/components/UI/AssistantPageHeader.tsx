import { PanelDockButton } from './PanelDockButton';
/* eslint-disable react/require-default-props */
import { ReactNode, useContext, useRef } from 'react';
import { useHeaderOverflow } from '../../utils/hooks/useHeaderOverflow';
import {
  ArrowUpRight,
  SquareArrowDownLeft,
  X,
  GripVertical,
  Ellipsis,
} from 'lucide-react';
import { AssistantPanelWindowContext } from './AssistantPanelContext';
import { ChromeIconButton } from './ChromeIconButton';
import {
  SidebarPageLayoutContext,
  PANEL_DRAG_MIME,
} from './SidebarPageLayoutContext';

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
  const header = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const showMore = useHeaderOverflow(header, more);
  const placement = useContext(AssistantPanelWindowContext);
  const layout = useContext(SidebarPageLayoutContext);
  const { title, floating, toggle, close } = placement || {};
  return (
    <div
      ref={header}
      className={`assistant-page-header${edgeToEdge ? ' assistant-page-header-edge' : ''} ${className}`}
      hidden={hidden}
    >
      {close && <span className="assistant-page-title">{title}</span>}
      {layout && (
        <ChromeIconButton
          icon={GripVertical}
          label="Arrange panel"
          data-header-essential
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(PANEL_DRAG_MIME, layout.page);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onClick={layout.menu}
          onKeyDown={(event) => {
            if (
              event.altKey &&
              ['ArrowLeft', 'ArrowRight'].includes(event.key)
            ) {
              event.preventDefault();
              layout.move(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
        />
      )}
      <div className="assistant-page-header-actions">{children}</div>
      {placement && !floating && <PanelDockButton />}
      {placement && (
        <ChromeIconButton
          label={floating ? `Dock ${title} back` : `Undock ${title}`}
          icon={floating ? SquareArrowDownLeft : ArrowUpRight}
          onClick={toggle}
        />
      )}
      <ChromeIconButton
        ref={more}
        icon={Ellipsis}
        label="More panel options"
        aria-haspopup="menu"
        data-header-more
        hidden
        onClick={showMore}
      />
      {close && (
        <ChromeIconButton
          icon={X}
          label={`Close ${title}`}
          data-header-essential
          onClick={close}
        />
      )}
    </div>
  );
}
