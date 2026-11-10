import { useEffect, useState } from 'react';

const developmentOverlaySelector =
  '#react-refresh-overlay, #webpack-dev-server-client-overlay';
const overlaySelector = `.rt-BaseDialogOverlay, [data-radix-popper-content-wrapper], ${developmentOverlaySelector}`;

// Native WebContentsViews sit above renderer portals. Scoped AI portals fit beside
// them; global Radix overlays need the existing snapshot/suspension treatment.
export function hasGlobalOverlay(root: ParentNode = document) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `.rt-BaseDialogOverlay[data-state="open"], [data-radix-popper-content-wrapper], ${developmentOverlaySelector}`
    )
  ).some((element) => {
    if (element.closest('.ai-overlay-layer')) return false;
    const content = element.matches(
      `.rt-BaseDialogOverlay, ${developmentOverlaySelector}`
    )
      ? element
      : element.querySelector<HTMLElement>(
          '[data-state="open"], [data-state="delayed-open"], [data-state="instant-open"]'
        );
    // These hints are collision-constrained to the workspace sidebar.
    if (content?.matches('.sidebar-tooltip')) return false;
    if (!content || content.hidden || !content.getClientRects().length)
      return false;
    const viewports = Array.from(
      root.querySelectorAll<HTMLElement>('.browser-viewport')
    ).filter((viewport) => viewport.getClientRects().length);
    if (!viewports.length) return true;
    const bounds = content.getBoundingClientRect();
    return viewports.some((viewport) => {
      const page = viewport.getBoundingClientRect();
      return (
        bounds.left < page.right &&
        bounds.right > page.left &&
        bounds.top < page.bottom &&
        bounds.bottom > page.top
      );
    });
  });
}

export function useNativeOverlay() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setOpen(hasGlobalOverlay());
    const relevant = (node: Node) =>
      node instanceof Element &&
      (node.matches(overlaySelector) || !!node.querySelector(overlaySelector));
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          record.type === 'attributes'
            ? record.target instanceof Element &&
              !!record.target.closest(overlaySelector)
            : [
                ...Array.from(record.addedNodes),
                ...Array.from(record.removedNodes),
              ].some(relevant)
        )
      )
        update();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'hidden', 'style'],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return open;
}
