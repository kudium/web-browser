import { frameResizeObserver } from '../frameResizeObserver';
import { useEffect, useRef, useState } from 'react';
import type { NativeOverlayReady } from '../../browser/contracts';

const developmentOverlaySelector =
  '#react-refresh-overlay, #webpack-dev-server-client-overlay';
const directOverlaySelector =
  '.rt-SelectContent, [data-native-overlay-content]';
const overlaySelector = `.rt-BaseDialogOverlay, [data-radix-popper-content-wrapper], ${directOverlaySelector}, ${developmentOverlaySelector}`;

// Native website and sidebar WebContentsViews sit above renderer portals.
// Reuse the same overlap detection and suspension for every native surface.
const allNativeSurfaces = '.browser-viewport, .sidebar-feature-content';

function overlappingOverlays(root: ParentNode, surfaces: string) {
  const viewports = Array.from(root.querySelectorAll<HTMLElement>(surfaces))
    .filter((viewport) => viewport.getClientRects().length)
    .map((viewport) => viewport.getBoundingClientRect());
  return [
    ...new Set(
      Array.from(
        root.querySelectorAll<HTMLElement>(
          `.rt-BaseDialogOverlay[data-state="open"], [data-radix-popper-content-wrapper], .rt-SelectContent[data-state="open"], [data-native-overlay-content], ${developmentOverlaySelector}`,
        ),
      ).map((element) =>
        element.matches(
          `.rt-BaseDialogOverlay, ${directOverlaySelector}, ${developmentOverlaySelector}`,
        )
          ? element
          : element.querySelector<HTMLElement>(
              '[data-state="open"], [data-state="delayed-open"], [data-state="instant-open"]',
            ),
      ),
    ),
  ].filter((content): content is HTMLElement => {
    // These hints are collision-constrained to the workspace sidebar.
    if (
      !content ||
      content.matches('.sidebar-tooltip') ||
      content.hidden ||
      !content.getClientRects().length
    )
      return false;
    if (!viewports.length)
      return (
        surfaces === allNativeSurfaces && !content.closest('.ai-overlay-layer')
      );
    const bounds = content.getBoundingClientRect();
    return viewports.some(
      (page) =>
        bounds.left < page.right &&
        bounds.right > page.left &&
        bounds.top < page.bottom &&
        bounds.bottom > page.top,
    );
  });
}

export function hasGlobalOverlay(
  root: ParentNode = document,
  surfaces = allNativeSurfaces,
) {
  return overlappingOverlays(root, surfaces).length > 0;
}

export function useNativeOverlayPresentation(
  surfaces: string,
  surface: NativeOverlayReady['surface'],
  onReady?: (callback: (event: NativeOverlayReady) => void) => () => void,
) {
  const [state, setState] = useState({ open: false, token: 0 });
  const current = useRef({ open: false, token: 0, ready: false });
  const overlays = useRef<HTMLElement[]>([]);
  const attribute = `data-native-overlay-${surface}`;
  const mark = () => {
    const value = current.current.ready ? 'ready' : 'pending';
    overlays.current.forEach((element) => {
      if (element.getAttribute(attribute) !== value)
        element.setAttribute(attribute, value);
    });
  };
  useEffect(
    () =>
      onReady?.((event) => {
        if (
          event.surface !== surface ||
          !current.current.open ||
          event.token !== current.current.token
        )
          return;
        current.current.ready = true;
        mark();
      }),
    [onReady, surface],
  );
  useEffect(() => {
    const update = () => {
      const next = overlappingOverlays(document, surfaces);
      overlays.current
        .filter((element) => !next.includes(element))
        .forEach((element) => element.removeAttribute(attribute));
      overlays.current = next;
      const open = next.length > 0;
      if (open !== current.current.open) {
        current.current = {
          open,
          token: current.current.token + 1,
          ready: !onReady,
        };
        setState({ open, token: current.current.token });
      }
      if (onReady) mark();
    };
    const geometry =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : frameResizeObserver(update);
    const observeSurfaces = () => {
      geometry?.disconnect();
      document
        .querySelectorAll(surfaces)
        .forEach((element) => geometry?.observe(element));
    };
    const relevant = (node: Node) =>
      node instanceof Element &&
      (node.matches(`${overlaySelector}, ${surfaces}`) ||
        !!node.querySelector(`${overlaySelector}, ${surfaces}`));
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          record.type === 'attributes'
            ? record.target instanceof Element &&
              (!!record.target.closest(overlaySelector) ||
                record.target.matches(surfaces) ||
                !!record.target.querySelector(surfaces))
            : [
                ...Array.from(record.addedNodes),
                ...Array.from(record.removedNodes),
              ].some(relevant),
        )
      ) {
        if (
          records.some(
            (record) =>
              record.type === 'childList' &&
              [...record.addedNodes, ...record.removedNodes].some(
                (node) =>
                  node instanceof Element &&
                  (node.matches(surfaces) || !!node.querySelector(surfaces)),
              ),
          )
        )
          observeSurfaces();
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
    return () => {
      overlays.current.forEach((element) => element.removeAttribute(attribute));
      observer.disconnect();
      geometry?.disconnect();
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [surfaces, surface, onReady]);
  return state;
}

export function useNativeOverlay(surfaces = allNativeSurfaces) {
  return useNativeOverlayPresentation(surfaces, 'page').open;
}
