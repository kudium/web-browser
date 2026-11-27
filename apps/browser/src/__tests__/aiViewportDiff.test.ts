/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';

const images = new Map<string, { width: number; height: number; bitmap: Buffer }>();
let lastBitmap: { buffer: Buffer; width: number; height: number } | undefined;
jest.mock('electron', () => ({
  nativeImage: {
    createFromPath: (file: string) => fake(images.get(file)),
    createFromBuffer: (buffer: Buffer) => fake(images.get(buffer.toString('utf8'))),
    createFromBitmap: (buffer: Buffer, size: { width: number; height: number }) => {
      lastBitmap = { buffer, ...size };
      return { toPNG: () => Buffer.from('png-diff') };
    },
  },
}));
function fake(entry?: { width: number; height: number; bitmap: Buffer }) {
  return {
    isEmpty: () => !entry,
    getSize: () => ({ width: entry!.width, height: entry!.height }),
    toBitmap: () => entry!.bitmap,
    resize: ({ width, height }: { width: number; height: number }) => fake({ width, height, bitmap: solid(width, height, 0) }),
  };
}
function solid(width: number, height: number, value: number) {
  return Buffer.alloc(width * height * 4, value);
}

import { aiViewportRequest, AIViewports } from '../main/aiViewport';
import { aiBaselinePath, aiDiffThreshold, compareAIScreenshot, diffBitmaps } from '../main/aiScreenshotDiff';
import { AIScriptAPI } from '../main/aiScriptApi';

it('validates viewport requests', () => {
  expect(aiViewportRequest({ reset: true })).toEqual({ reset: true });
  expect(aiViewportRequest({ width: 390, height: 844, mobile: true, deviceScale: 3, colorScheme: 'dark' })).toEqual({
    width: 390,
    height: 844,
    mobile: true,
    deviceScale: 3,
    colorScheme: 'dark',
  });
  expect(aiViewportRequest({ width: 1280, height: 800 })).toEqual({ width: 1280, height: 800, mobile: false });
  expect(() => aiViewportRequest({ width: 100, height: 800 })).toThrow('width');
  expect(() => aiViewportRequest({ width: 1280, height: 800, deviceScale: 9 })).toThrow('deviceScale');
  expect(() => aiViewportRequest({ width: 1280, height: 800, colorScheme: 'blue' })).toThrow('colorScheme');
  expect(() => aiViewportRequest({ width: 1280, height: 800, mobile: 'yes' })).toThrow('mobile');
});

function contents(id: number) {
  const listeners: Record<string, () => void> = {};
  return {
    id,
    isDestroyed: () => false,
    enableDeviceEmulation: jest.fn(),
    disableDeviceEmulation: jest.fn(),
    once: (event: string, listener: () => void) => {
      listeners[event] = listener;
    },
    listeners,
  };
}

it('applies native emulation, swaps the theme once and restores everything on reset', () => {
  let theme: 'system' | 'light' | 'dark' = 'system';
  const viewports = new AIViewports({ get: () => theme, set: (value) => { theme = value; } });
  const one = contents(1);
  const two = contents(2);
  expect(viewports.apply(one as never, { width: 390, height: 844, mobile: true, deviceScale: 3, colorScheme: 'dark' })).toEqual({
    emulated: true,
    width: 390,
    height: 844,
    mobile: true,
    deviceScale: 3,
    colorScheme: 'dark',
    browserTheme: 'dark',
  });
  expect(one.enableDeviceEmulation).toHaveBeenCalledWith({
    screenPosition: 'mobile',
    screenSize: { width: 390, height: 844 },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: 3,
    viewSize: { width: 390, height: 844 },
    scale: 1,
  });
  expect(theme).toBe('dark');
  viewports.apply(two as never, { width: 1280, height: 800, mobile: false, colorScheme: 'light' });
  expect(theme).toBe('light');
  expect(viewports.reset(one as never)).toEqual({ emulated: false });
  expect(one.disableDeviceEmulation).toHaveBeenCalledTimes(1);
  expect(theme).toBe('light'); // two still emulates
  viewports.resetAll();
  expect(two.disableDeviceEmulation).toHaveBeenCalledTimes(1);
  expect(theme).toBe('system');
  expect(viewports.describe(two as never)).toEqual({ emulated: false });
  viewports.resetAll(); // idempotent
  expect(theme).toBe('system');
});

it('diffs bitmaps with a per-channel tolerance and paints changed pixels red', () => {
  const a = Buffer.from([10, 10, 10, 255, 200, 200, 200, 255]);
  const b = Buffer.from([20, 10, 10, 255, 100, 200, 200, 255]);
  const result = diffBitmaps(a, b, 2, 1);
  expect(result.changed).toBe(1);
  expect(result.total).toBe(2);
  expect([...result.mask]).toEqual([2, 2, 2, 255, 0, 0, 255, 255]);
  expect(() => diffBitmaps(a, Buffer.alloc(4), 2, 1)).toThrow('smaller');
  expect(aiDiffThreshold(undefined)).toBe(0.005);
  expect(() => aiDiffThreshold(2)).toThrow('threshold');
});

it('compares a capture with a baseline file, resizing on mismatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-diff-'));
  const baseline = path.join(root, 'base.png');
  fs.writeFileSync(baseline, 'x');
  images.set(baseline, { width: 2, height: 2, bitmap: solid(2, 2, 0) });
  images.set('same', { width: 2, height: 2, bitmap: solid(2, 2, 0) });
  const changed = solid(2, 2, 0);
  changed.fill(255, 0, 4);
  images.set('changed', { width: 2, height: 2, bitmap: changed });
  images.set('bigger', { width: 4, height: 4, bitmap: solid(4, 4, 0) });
  expect(aiBaselinePath(baseline)).toBe(baseline);
  expect(() => aiBaselinePath('relative.png')).toThrow('absolute');
  expect(() => aiBaselinePath(path.join(root, 'missing.png'))).toThrow('does not exist');
  const same = compareAIScreenshot(baseline, { data: Buffer.from('same').toString('base64'), mimeType: 'image/png' });
  expect(same).toMatchObject({ changedPixels: 0, totalPixels: 4, changedRatio: 0, same: true, sizeMismatch: false, width: 2, height: 2 });
  expect(same.diff).toEqual({ data: Buffer.from('png-diff').toString('base64'), mimeType: 'image/png' });
  const differs = compareAIScreenshot(baseline, { data: Buffer.from('changed').toString('base64'), mimeType: 'image/jpeg' }, 0.1);
  expect(differs).toMatchObject({ changedPixels: 1, changedRatio: 0.25, same: false, threshold: 0.1 });
  expect(lastBitmap).toMatchObject({ width: 2, height: 2 });
  expect(compareAIScreenshot(baseline, { data: Buffer.from('bigger').toString('base64'), mimeType: 'image/png' })).toMatchObject({
    sizeMismatch: true,
    same: true,
  });
  expect(() => compareAIScreenshot(baseline, { data: Buffer.from('nope').toString('base64'), mimeType: 'image/png' })).toThrow('decoded');
  fs.rmSync(root, { recursive: true, force: true });
});

it('maps the QA script methods onto the tools and keeps diff images out of the script', async () => {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const api = new AIScriptAPI(
    async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args });
      if (tool === 'screenshot')
        return {
          data: 'abc',
          mimeType: 'image/jpeg',
          comparison: { changedRatio: 0.2, same: false, diff: { data: 'ddd', mimeType: 'image/png' } },
        };
      return { ok: true };
    },
    { scopeTab: () => 't1' }
  );
  await api.invoke('console', { since: 5, limit: 10 });
  await api.invoke('requests', { filter: '/api/', limit: 3 });
  await api.invoke('setViewport', { width: 390, height: 844, mobile: true });
  await api.invoke('wait', { request: 'save', timeout: 2000 });
  const shot = await api.invoke('screenshot', { compareTo: '/tmp/base.png', threshold: 0.1 });
  expect(calls).toEqual([
    { tool: 'read_console', args: { tabId: 't1', since: 5, limit: 10 } },
    { tool: 'read_requests', args: { tabId: 't1', filter: '/api/', limit: 3 } },
    { tool: 'set_viewport', args: { tabId: 't1', width: 390, height: 844, mobile: true } },
    { tool: 'wait_until', args: { tabId: 't1', format: 'compact', request: 'save', timeoutMs: 2000 } },
    { tool: 'screenshot', args: { tabId: 't1', compareTo: '/tmp/base.png', threshold: 0.1 } },
  ]);
  expect(shot).toEqual({
    captured: true,
    index: 0,
    mimeType: 'image/jpeg',
    comparison: { changedRatio: 0.2, same: false, diffIndex: 1 },
  });
  expect(api.images.map((image) => image.mimeType)).toEqual(['image/jpeg', 'image/png']);
});
