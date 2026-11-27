/**
 * Viewport and device emulation for responsive checks (spec 4.11). Size,
 * mobile mode and device scale use Electron's native device emulation and
 * persist across navigations of that tab; the colour scheme toggle is the
 * browser-wide native theme source (Electron has no per-tab switch without a
 * permanently attached debugger), so it is remembered and restored on reset.
 * Everything is reset when the run ends.
 */
import type { WebContents } from 'electron';

export interface AIViewport {
  width: number;
  height: number;
  mobile: boolean;
  deviceScale?: number;
  colorScheme?: 'light' | 'dark';
}
export type AIViewportRequest = { reset: true } | ({ reset?: false } & AIViewport);

export const AI_VIEWPORT_LIMITS = { min: 200, max: 4096, scaleMin: 0.5, scaleMax: 3 } as const;

/** Validate the tool arguments; `reset: true` alone clears the emulation. */
export function aiViewportRequest(args: Record<string, unknown>): AIViewportRequest {
  if (args.reset === true) return { reset: true };
  if (args.reset !== undefined && args.reset !== false) throw new Error('reset must be boolean.');
  const dimension = (value: unknown, name: string) => {
    if (!Number.isInteger(value) || Number(value) < AI_VIEWPORT_LIMITS.min || Number(value) > AI_VIEWPORT_LIMITS.max)
      throw new Error(`${name} must be an integer from ${AI_VIEWPORT_LIMITS.min} to ${AI_VIEWPORT_LIMITS.max}.`);
    return Number(value);
  };
  const viewport: AIViewport = {
    width: dimension(args.width, 'width'),
    height: dimension(args.height, 'height'),
    mobile: args.mobile === true,
  };
  if (args.mobile !== undefined && typeof args.mobile !== 'boolean') throw new Error('mobile must be boolean.');
  if (args.deviceScale !== undefined) {
    const scale = Number(args.deviceScale);
    if (!Number.isFinite(scale) || scale < AI_VIEWPORT_LIMITS.scaleMin || scale > AI_VIEWPORT_LIMITS.scaleMax)
      throw new Error(`deviceScale must be between ${AI_VIEWPORT_LIMITS.scaleMin} and ${AI_VIEWPORT_LIMITS.scaleMax}.`);
    viewport.deviceScale = scale;
  }
  if (args.colorScheme !== undefined) {
    if (args.colorScheme !== 'light' && args.colorScheme !== 'dark')
      throw new Error('colorScheme must be light or dark.');
    viewport.colorScheme = args.colorScheme;
  }
  return viewport;
}

export interface AIThemeSource {
  get(): 'system' | 'light' | 'dark';
  set(value: 'system' | 'light' | 'dark'): void;
}

export class AIViewports {
  private applied = new Map<number, { contents: WebContents; viewport: AIViewport }>();

  private previousTheme: 'system' | 'light' | 'dark' | undefined;

  constructor(private theme: AIThemeSource) {}

  apply(contents: WebContents, viewport: AIViewport) {
    if (contents.isDestroyed()) throw new Error('Tab closed before the viewport changed.');
    contents.enableDeviceEmulation({
      screenPosition: viewport.mobile ? 'mobile' : 'desktop',
      screenSize: { width: viewport.width, height: viewport.height },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: viewport.deviceScale ?? 0,
      viewSize: { width: viewport.width, height: viewport.height },
      scale: 1,
    });
    if (viewport.colorScheme) {
      if (this.previousTheme === undefined) this.previousTheme = this.theme.get();
      this.theme.set(viewport.colorScheme);
    }
    this.applied.set(contents.id, { contents, viewport });
    contents.once('destroyed', () => this.applied.delete(contents.id));
    return this.describe(contents);
  }

  describe(contents: WebContents) {
    const entry = this.applied.get(contents.id);
    return entry
      ? { emulated: true as const, ...entry.viewport, ...(this.previousTheme !== undefined ? { browserTheme: this.theme.get() } : {}) }
      : { emulated: false as const };
  }

  reset(contents: WebContents) {
    const entry = this.applied.get(contents.id);
    this.applied.delete(contents.id);
    if (entry && !contents.isDestroyed()) contents.disableDeviceEmulation();
    if (!this.applied.size) this.restoreTheme();
    return { emulated: false as const };
  }

  /** Every emulation this controller applied, at run end or dispose. */
  resetAll() {
    [...this.applied.values()].forEach(({ contents }) => {
      if (!contents.isDestroyed()) contents.disableDeviceEmulation();
    });
    this.applied.clear();
    this.restoreTheme();
  }

  private restoreTheme() {
    if (this.previousTheme === undefined) return;
    this.theme.set(this.previousTheme);
    this.previousTheme = undefined;
  }
}
