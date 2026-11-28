import { layoutAutofillPopup, validAutofillPopupPlacement } from '../browser/autofillPopupPlacement';

const viewport = { width: 1000, height: 700 };
const input = { left: 350, right: 650, top: 300, bottom: 340 };
const size = { width: 290, height: 200 };

it('restores side and offset relative to a different input', () => {
  const point = { side: 'below', x: 35, y: 16 } as const;
  const first = layoutAutofillPopup(input, viewport, size, point)!;
  const next = layoutAutofillPopup({ left: 450, right: 750, top: 400, bottom: 440 }, viewport, size, point)!;
  expect(first.left).toBe(385);
  expect(first.top).toBe(360);
  expect(next.left - first.left).toBe(100);
  expect(next.top - first.top).toBe(100);
});

it('anchors above the field so increasing content height cannot cover it', () => {
  const result = layoutAutofillPopup(input, viewport, size, { side: 'above', x: 0, y: 12 })!;
  expect(result.bottom).toBe(416);
  expect(result.maxHeight).toBe(276);
  expect(viewport.height - result.bottom! + 4).toBeLessThanOrEqual(input.top);
  const loading = layoutAutofillPopup(input, viewport, { width: 0, height: 0 }, { side: 'above', x: 50, y: 46 })!;
  expect(loading.bottom).toBe(450);
  expect(loading.maxHeight).toBe(242);
  const below = layoutAutofillPopup(input, viewport, { width: 0, height: 0 }, { side: 'below', x: 0, y: 150 })!;
  expect(below.top).toBe(494);
  expect(below.maxHeight).toBe(198);
});

it('falls back from an unavailable saved side and keeps cramped pickers scrollable', () => {
  const nearBottom = { ...input, top: 650, bottom: 690 };
  const result = layoutAutofillPopup(nearBottom, viewport, size, { side: 'below', x: 0, y: 0 })!;
  expect(result.side).toBe('above');
  const short = layoutAutofillPopup({ left: 10, right: 290, top: 95, bottom: 125 }, { width: 300, height: 220 }, size)!;
  expect(short.maxHeight).toBe(83);
  expect(layoutAutofillPopup({ left: 0, right: 300, top: 0, bottom: 220 }, { width: 300, height: 220 }, size)).toBeNull();
});

it('projects drags onto every side without covering the field or escaping the viewport', () => {
  const sides = new Set<string>();
  for (const width of [240, 390, 1000]) for (const height of [180, 700]) {
    const field = { left: width / 3, right: width * 2 / 3, top: height / 2 - 20, bottom: height / 2 + 20 };
    for (const left of [-500, 8, width / 2, width + 500]) for (const top of [-500, 8, height / 2, height + 500]) {
      const layout = layoutAutofillPopup(field, { width, height }, size, null, { left, top });
      if (!layout) continue;
      sides.add(layout.side);
      const actualHeight = Math.min(size.height, layout.maxHeight);
      const panelTop = layout.bottom === undefined ? layout.top : height - layout.bottom - actualHeight;
      const right = layout.left + layout.width, bottom = panelTop + actualHeight;
      expect(layout.left).toBeGreaterThanOrEqual(8);
      expect(right).toBeLessThanOrEqual(width - 8);
      expect(panelTop).toBeGreaterThanOrEqual(8);
      expect(bottom).toBeLessThanOrEqual(height - 8);
      expect(right <= field.left - 4 || layout.left >= field.right + 4 || bottom <= field.top - 4 || panelTop >= field.bottom + 4).toBe(true);
      expect(validAutofillPopupPlacement(layout)).toBe(true);
    }
  }
  expect(sides).toEqual(new Set(['above', 'below', 'left', 'right']));
});

it.each([
  null, {}, { side: 'center', x: 0, y: 0 }, { side: 'below', x: Infinity, y: 0 },
  { side: 'below', x: 0, y: -1 }, { side: 'right', x: -1, y: 0 },
  { side: 'above', x: 4097, y: 0 }, { side: 'left', x: 0, y: NaN },
])('rejects invalid persisted placement %j', value => {
  expect(validAutofillPopupPlacement(value)).toBe(false);
});
