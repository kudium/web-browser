/**
 * Screenshot comparison for before/after checks (spec 4.11): a baseline file
 * against the current capture, returning the changed-pixel ratio and a diff
 * image. Pure pixel work is separate from the Electron image plumbing so it is
 * unit-tested without a renderer.
 */
import fs from 'fs';
import path from 'path';
import { nativeImage } from 'electron';

export const AI_DIFF_DEFAULT_THRESHOLD = 0.005;
export const AI_DIFF_PIXEL_TOLERANCE = 24;
const AI_DIFF_BASELINE_LIMIT = 12 * 1024 * 1024;

export interface AIBitmapDiff {
  changed: number;
  total: number;
  /** BGRA diff image: changed pixels red over a dimmed baseline. */
  mask: Buffer;
}

/** Compare two BGRA bitmaps of the same size; a pixel changes when any channel moves past the tolerance. */
export function diffBitmaps(
  baseline: Buffer,
  current: Buffer,
  width: number,
  height: number,
  tolerance = AI_DIFF_PIXEL_TOLERANCE
): AIBitmapDiff {
  const total = width * height;
  if (baseline.length < total * 4 || current.length < total * 4)
    throw new Error('Bitmap is smaller than its declared size.');
  const mask = Buffer.alloc(total * 4);
  let changed = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const differs =
      Math.abs(baseline[offset] - current[offset]) > tolerance ||
      Math.abs(baseline[offset + 1] - current[offset + 1]) > tolerance ||
      Math.abs(baseline[offset + 2] - current[offset + 2]) > tolerance ||
      Math.abs(baseline[offset + 3] - current[offset + 3]) > tolerance;
    if (differs) {
      changed += 1;
      mask[offset] = 0;
      mask[offset + 1] = 0;
      mask[offset + 2] = 255;
      mask[offset + 3] = 255;
    } else {
      mask[offset] = baseline[offset] >> 2;
      mask[offset + 1] = baseline[offset + 1] >> 2;
      mask[offset + 2] = baseline[offset + 2] >> 2;
      mask[offset + 3] = 255;
    }
  }
  return { changed, total, mask };
}

export function aiDiffThreshold(value: unknown) {
  if (value === undefined) return AI_DIFF_DEFAULT_THRESHOLD;
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error('threshold must be a changed-pixel ratio from 0 to 1.');
  return threshold;
}

export function aiBaselinePath(value: unknown) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || value.length > 4096)
    throw new Error('compareTo must be an absolute path to a PNG or JPEG file.');
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(value);
  } catch {
    throw new Error('compareTo file does not exist.');
  }
  if (!stat.isFile()) throw new Error('compareTo must be a regular file.');
  if (stat.size > AI_DIFF_BASELINE_LIMIT) throw new Error('compareTo file is larger than 12 MB.');
  return value;
}

export interface AIScreenshotComparison {
  baseline: string;
  width: number;
  height: number;
  changedPixels: number;
  totalPixels: number;
  changedRatio: number;
  threshold: number;
  same: boolean;
  /** The capture was resized to the baseline's dimensions before comparing. */
  sizeMismatch: boolean;
  diff: { data: string; mimeType: 'image/png' };
}

/** Compare a capture (base64 PNG/JPEG/WebP) with the baseline file at the baseline's size. */
export function compareAIScreenshot(
  baselinePath: string,
  capture: { data: string; mimeType: string },
  threshold = AI_DIFF_DEFAULT_THRESHOLD
): AIScreenshotComparison {
  const baseline = nativeImage.createFromPath(baselinePath);
  if (baseline.isEmpty()) throw new Error('compareTo is not a readable PNG or JPEG image.');
  let current = nativeImage.createFromBuffer(Buffer.from(capture.data, 'base64'));
  if (current.isEmpty()) throw new Error('The capture could not be decoded for comparison.');
  const size = baseline.getSize();
  const sizeMismatch =
    current.getSize().width !== size.width || current.getSize().height !== size.height;
  if (sizeMismatch) current = current.resize({ width: size.width, height: size.height, quality: 'best' });
  const { changed, total, mask } = diffBitmaps(baseline.toBitmap(), current.toBitmap(), size.width, size.height);
  const changedRatio = total ? changed / total : 0;
  return {
    baseline: baselinePath,
    width: size.width,
    height: size.height,
    changedPixels: changed,
    totalPixels: total,
    changedRatio: Number(changedRatio.toFixed(5)),
    threshold,
    same: changedRatio <= threshold,
    sizeMismatch,
    diff: {
      data: nativeImage.createFromBitmap(mask, { width: size.width, height: size.height }).toPNG().toString('base64'),
      mimeType: 'image/png',
    },
  };
}
