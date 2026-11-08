/* This wrapper forwards Radix's complete props API. */
/* eslint-disable react/jsx-props-no-spreading, react/require-default-props */
import {
  createContext,
  useContext,
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  ReactNode,
} from 'react';
import { Dialog, Popover, DropdownMenu, ContextMenu } from '@radix-ui/themes';

export const PanelOverlayContext = createContext<HTMLElement | null>(null);

export function PanelOverlayProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PanelOverlayContext.Provider value={container}>
      {children}
    </PanelOverlayContext.Provider>
  );
}

export function usePanelOverlay() {
  return useContext(PanelOverlayContext) || undefined;
}

// Keep dialogs within their panel. Other surfaces use the normal portal.
export const PanelDialogContent = forwardRef<
  ElementRef<typeof Dialog.Content>,
  ComponentPropsWithoutRef<typeof Dialog.Content>
>(function PanelDialogContent(props, ref) {
  const container = usePanelOverlay();
  const { container: requestedContainer, className } = props;
  // Forward the complete Radix dialog API, including focus and dismissal handlers.
  return (
    <Dialog.Content
      ref={ref}
      {...props}
      className={['panel-dialog-content', className].filter(Boolean).join(' ')}
      container={container ?? requestedContainer}
    />
  );
});

export const PanelPopoverContent = forwardRef<
  ElementRef<typeof Popover.Content>,
  ComponentPropsWithoutRef<typeof Popover.Content>
>(function PanelPopoverContent(props, ref) {
  const container = usePanelOverlay();
  const {
    container: requestedContainer,
    collisionBoundary,
    collisionPadding,
  } = props;
  return (
    <Popover.Content
      ref={ref}
      {...props}
      container={container ?? requestedContainer}
      collisionBoundary={container ?? collisionBoundary}
      collisionPadding={container ? 12 : collisionPadding}
    />
  );
});
export const PanelDropdownContent = forwardRef<
  ElementRef<typeof DropdownMenu.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function PanelDropdownContent(props, ref) {
  const container = usePanelOverlay();
  const {
    container: requestedContainer,
    collisionBoundary,
    collisionPadding,
  } = props;
  return (
    <DropdownMenu.Content
      ref={ref}
      {...props}
      container={container ?? requestedContainer}
      collisionBoundary={container ?? collisionBoundary}
      collisionPadding={container ? 12 : collisionPadding}
    />
  );
});
export const PanelContextContent = forwardRef<
  ElementRef<typeof ContextMenu.Content>,
  ComponentPropsWithoutRef<typeof ContextMenu.Content>
>(function PanelContextContent(props, ref) {
  const container = usePanelOverlay();
  const {
    container: requestedContainer,
    collisionBoundary,
    collisionPadding,
  } = props;
  return (
    <ContextMenu.Content
      ref={ref}
      {...props}
      container={container ?? requestedContainer}
      collisionBoundary={container ?? collisionBoundary}
      collisionPadding={container ? 12 : collisionPadding}
    />
  );
});

export function PanelDialogHeader({
  title,
  leading = null,
  actions = null,
}: {
  title: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-dialog-header">
      {leading && <div className="panel-dialog-leading">{leading}</div>}
      <Dialog.Title
        className="panel-dialog-title"
        size="3"
        mb="0"
        trim="normal"
      >
        {title}
      </Dialog.Title>
      {actions && <div className="panel-dialog-actions">{actions}</div>}
    </div>
  );
}
