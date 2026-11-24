import { useEffect, useState } from 'react';

const developmentOverlaySelector =
  '#react-refresh-overlay, #webpack-dev-server-client-overlay';
const overlaySelector = `.rt-BaseDialogOverlay, [data-radix-popper-content-wrapper], ${developmentOverlaySelector}`;

// Native website and sidebar WebContentsViews sit above renderer portals.
// Reuse the same overlap detection and suspension for every native surface.
const allNativeSurfaces = '.browser-viewport, .sidebar-feature-content';

export function hasGlobalOverlay(root: ParentNode = document, surfaces = allNativeSurfaces) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `.rt-BaseDialogOverlay[data-state="open"], [data-radix-popper-content-wrapper], ${developmentOverlaySelector}`
    )
  ).some((element) => {
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
      root.querySelectorAll<HTMLElement>(surfaces)
    ).filter((viewport) => viewport.getClientRects().length);
    if (!viewports.length) return surfaces === allNativeSurfaces && !element.closest('.ai-overlay-layer');
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

export function useNativeOverlay(surfaces = allNativeSurfaces) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setOpen(hasGlobalOverlay(document, surfaces));
    const geometry = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    const observeSurfaces = () => {
      geometry?.disconnect();
      document.querySelectorAll(surfaces).forEach(element => geometry?.observe(element));
    };
    const relevant = (node: Node) =>
      node instanceof Element &&
      (node.matches(`${overlaySelector}, ${surfaces}`) || !!node.querySelector(`${overlaySelector}, ${surfaces}`));
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          record.type === 'attributes'
            ? record.target instanceof Element &&
              (!!record.target.closest(overlaySelector) || record.target.matches(surfaces) || !!record.target.querySelector(surfaces))
            : [
                ...Array.from(record.addedNodes),
                ...Array.from(record.removedNodes),
              ].some(relevant)
        )
      ) {
        if (records.some(record => record.type === 'childList')) observeSurfaces();
        update();
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'hidden', 'style', 'class'],
    });
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    observeSurfaces();
    update();
    return () => { observer.disconnect(); geometry?.disconnect(); window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true); };
  }, [surfaces]);
  return open;
}
