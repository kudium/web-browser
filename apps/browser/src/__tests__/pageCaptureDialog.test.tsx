import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PageCaptureDialog } from '../components/UI/PageCaptureDialog';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({ browser: { capture: jest.fn() } }));
const capture = browser.capture as jest.Mock;
const preview = {
  kind: 'preview',
  captureId: 'capture-1',
  name: 'Page',
  preview: 'data:image/png;base64,cGl4ZWxz',
  width: 1200,
  height: 800,
};
beforeEach(() => {
  capture.mockReset().mockResolvedValue(preview);
});

it('supports keyboard selection, image-pixel crops, failed-save recovery and clipboard confirmation', async () => {
  const close = jest.fn();
  render(
    <Theme>
      <PageCaptureDialog tabId="page" mode="area" onClose={close} />
    </Theme>
  );
  const area = await screen.findByRole('application', {
    name: 'Select screenshot area',
  });
  expect(screen.getByRole('button', { name: 'Save image' })).toBeDisabled();
  fireEvent.keyDown(area, { key: 'Enter' });
  expect(screen.getByText('600 × 400')).toBeInTheDocument();
  capture.mockRejectedValueOnce(new Error('Disk is full'));
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
  await screen.findByRole('alert');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled();
  expect(capture).toHaveBeenLastCalledWith({
    action: 'save',
    captureId: 'capture-1',
    rectangle: { x: 300, y: 200, width: 600, height: 400 },
  });
  capture.mockResolvedValueOnce({ kind: 'copied' });
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await screen.findByRole('button', { name: 'Copied' });
  fireEvent.keyDown(area, { key: 'ArrowRight' });
  expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Whole image' }));
  expect(screen.getByText('1200 × 800')).toBeInTheDocument();
});

it('cancels an in-flight capture and releases completed previews on dismissal', async () => {
  capture.mockReturnValueOnce(new Promise(() => {}));
  const close = jest.fn();
  const view = render(
    <Theme>
      <PageCaptureDialog tabId="page" mode="visible" onClose={close} />
    </Theme>
  );
  await screen.findByText('Capturing page…');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(capture).toHaveBeenLastCalledWith({ action: 'cancel' });
  expect(close).toHaveBeenCalled();
  view.unmount();
  render(
    <Theme>
      <PageCaptureDialog tabId="page" mode="visible" onClose={close} />
    </Theme>
  );
  await screen.findByAltText('Captured webpage');
});

it('closes a canceled PDF save without reporting success', async () => {
  capture.mockResolvedValueOnce({ kind: 'canceled' });
  const close = jest.fn();
  render(
    <Theme>
      <PageCaptureDialog tabId="page" mode="pdf" onClose={close} />
    </Theme>
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(capture).toHaveBeenCalledWith({ action: 'pdf', tabId: 'page' });
});

it('coalesces pointer selections and saves the exact release position', async () => {
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent });
  HTMLElement.prototype.setPointerCapture = jest.fn();
  const view = render(<Theme><PageCaptureDialog tabId="page" mode="area" onClose={jest.fn()} /></Theme>);
  const area = await screen.findByRole('application', { name: 'Select screenshot area' });
  const image = screen.getByAltText('Captured webpage');
  jest.spyOn(image, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 800 } as DOMRect);
  const callbacks = new Map<number, FrameRequestCallback>(); let next = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { callbacks.set(++next, fn); return next; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  fireEvent.pointerDown(area, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(area, { clientX: 200, clientY: 200 });
  fireEvent.pointerMove(area, { clientX: 300, clientY: 300 });
  expect(callbacks.size).toBe(1);
  expect(screen.getByRole('button', { name: 'Save image' })).toBeDisabled();
  fireEvent.pointerUp(area, { clientX: 500, clientY: 400 });
  expect(callbacks.size).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
  await waitFor(() => expect(capture).toHaveBeenCalledWith({ action: 'save', captureId: 'capture-1', rectangle: { x: 120, y: 100, width: 480, height: 300 } }));
  view.unmount(); raf.mockRestore(); cancel.mockRestore();
});
