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
      : element.querySelector<HTMLElement>('[data-state="open"]');
    return !!content && !content.hidden && content.getClientRects().length > 0;
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
