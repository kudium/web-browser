export type PageCaptureMode = 'area' | 'visible' | 'full' | 'pdf';
export interface CaptureRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageCapturePreview {
  kind: 'preview';
  captureId: string;
  name: string;
  preview: string;
  width: number;
  height: number;
}
export type PageCaptureRequest =
  | { action: 'capture'; tabId: string; mode: 'visible' | 'full' }
  | { action: 'pdf'; tabId: string }
  | { action: 'cancel' }
  | { action: 'copy' | 'save'; captureId: string; rectangle?: CaptureRectangle }
  | { action: 'release'; captureId: string };
export type PageCaptureResult =
  | PageCapturePreview
  | { kind: 'saved' | 'copied' | 'canceled' | 'released' };

/** Crop coordinates are image pixels, independent of page zoom and screen DPI. */
export function captureRectangle(
  value: CaptureRectangle | undefined,
  width: number,
  height: number
): CaptureRectangle {
  if (value === undefined) return { x: 0, y: 0, width, height };
  const keys = ['x', 'y', 'width', 'height'] as const;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !keys.every((key) => Number.isInteger(value[key])) ||
    value.x < 0 ||
    value.y < 0 ||
    value.width < 1 ||
    value.height < 1 ||
    value.x + value.width > width ||
    value.y + value.height > height
  )
    throw new Error('Select an area inside the captured page.');
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}
