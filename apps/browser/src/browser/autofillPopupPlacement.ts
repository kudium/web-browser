export type AutofillPopupPlacement = {
  side: 'above' | 'below' | 'left' | 'right';
  x: number;
  y: number;
};
type Bounds = { left: number; right: number; top: number; bottom: number };
export type AutofillPopupLayout = AutofillPopupPlacement & {
  left: number;
  top: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

export function createAutofillPopupPlacement() {
  function validAutofillPopupPlacement(value: unknown): value is AutofillPopupPlacement {
    if (!value || typeof value !== 'object') return false;
    const point = value as AutofillPopupPlacement;
    return ['above', 'below', 'left', 'right'].includes(point.side) &&
      Number.isFinite(point.x) && Math.abs(point.x) <= 4096 &&
      Number.isFinite(point.y) && Math.abs(point.y) <= 4096 &&
      (point.side === 'above' || point.side === 'below' ? point.y >= 0 : point.x >= 0);
  }

  /** Project a requested position into space outside the field and inside the viewport. */
  function layoutAutofillPopup(
    input: Bounds,
    viewport: { width: number; height: number },
    size: { width: number; height: number },
    saved?: AutofillPopupPlacement | null,
    desired?: { left: number; top: number },
  ): AutofillPopupLayout | null {
    const inset = 8, gap = 4;
    const width = Math.min(290, viewport.width - inset * 2);
    const height = Math.min(320, size.height || 320);
    if (width < 44 || viewport.height < 60) return null;
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
    const regions: Record<AutofillPopupPlacement['side'], Bounds> = {
      below: { left: inset, right: viewport.width - inset, top: Math.max(inset, input.bottom + gap), bottom: viewport.height - inset },
      above: { left: inset, right: viewport.width - inset, top: inset, bottom: Math.min(viewport.height - inset, input.top - gap) },
      left: { left: inset, right: Math.min(viewport.width - inset, input.left - gap), top: inset, bottom: viewport.height - inset },
      right: { left: Math.max(inset, input.right + gap), right: viewport.width - inset, top: inset, bottom: viewport.height - inset },
    };
    const candidates: AutofillPopupLayout[] = [];
    for (const side of ['below', 'above', 'right', 'left'] as const) {
      const region = regions[side];
      const availableWidth = region.right - region.left, availableHeight = region.bottom - region.top;
      if (availableWidth < Math.min(width, 220) || availableHeight < 44) continue;
      let panelWidth = Math.min(width, availableWidth), panelHeight = Math.min(height, availableHeight);
      const point = saved?.side === side ? saved : { side, x: 0, y: 0 };
      let left = input.left, top = input.bottom + gap;
      if (side === 'above') { left += point.x; top = input.top - gap - point.y - panelHeight; }
      if (side === 'below') { left += point.x; top += point.y; }
      if (side === 'left') { left = input.left - gap - point.x - panelWidth; top = input.top + point.y; }
      if (side === 'right') { left = input.right + gap + point.x; top = input.top + point.y; }
      if (!desired && saved?.side === side) {
        // Keep the remembered gap even while loading or when content grows.
        // Reduce the scrollable size before moving that anchor toward the field.
        if (side === 'above') {
          const anchor = clamp(input.top - gap - point.y, region.top + 44, region.bottom);
          panelHeight = Math.min(height, anchor - region.top);
          top = anchor - panelHeight;
        } else {
          top = clamp(top, region.top, region.bottom - 44);
          panelHeight = Math.min(height, region.bottom - top);
        }
        if (side === 'left') {
          const anchor = clamp(input.left - gap - point.x, region.left + Math.min(width, 220), region.right);
          panelWidth = Math.min(width, anchor - region.left);
          left = anchor - panelWidth;
        }
        if (side === 'right') {
          left = clamp(left, region.left, region.right - Math.min(width, 220));
          panelWidth = Math.min(width, region.right - left);
        }
      }
      if (desired) { left = desired.left; top = desired.top; }
      left = clamp(left, region.left, region.right - panelWidth);
      top = clamp(top, region.top, region.bottom - panelHeight);
      const bottomEdge = top + panelHeight, rightEdge = left + panelWidth;
      const x = side === 'left' ? input.left - gap - rightEdge : side === 'right' ? left - input.right - gap : left - input.left;
      const y = side === 'above' ? input.top - gap - bottomEdge : side === 'below' ? top - input.bottom - gap : top - input.top;
      candidates.push({ side, x, y, left, top, width: panelWidth,
        ...(side === 'above' ? { bottom: viewport.height - bottomEdge } : {}),
        maxHeight: Math.min(320, side === 'above' ? bottomEdge - region.top : region.bottom - top) });
    }
    if (!candidates.length) return null;
    if (desired) {
      // Keep the current size when possible; shrink only if no full-size position fits.
      const fullSize = candidates.filter(candidate => candidate.width >= Math.min(width, size.width || width) && candidate.maxHeight >= height);
      const choices = fullSize.length ? fullSize : candidates;
      return choices.reduce((best, next) =>
        Math.hypot(next.left - desired.left, next.top - desired.top) < Math.hypot(best.left - desired.left, best.top - desired.top) ? next : best);
    }
    const preferred = saved && candidates.find(candidate => candidate.side === saved.side);
    if (preferred) return preferred;
    const below = candidates.find(candidate => candidate.side === 'below');
    const above = candidates.find(candidate => candidate.side === 'above');
    if (below && below.maxHeight >= Math.min(320, above?.maxHeight || 0)) return below;
    return above || below || candidates[0];
  }

  return { validAutofillPopupPlacement, layoutAutofillPopup };
}

export const { validAutofillPopupPlacement, layoutAutofillPopup } = createAutofillPopupPlacement();
