import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeveloperPDFPreview } from '../components/UI/DeveloperPDFPreview';

const draw = jest.fn(() => ({ promise: Promise.resolve(), cancel: jest.fn() }));
const page = {
  getViewport: jest.fn(({ scale }) => ({
    width: 200 * scale,
    height: 300 * scale,
  })),
  render: draw,
};
const document = { numPages: 2, getPage: jest.fn(async () => page) };
const destroy = jest.fn(async () => {});
const getDocument = jest.fn(() => ({
  promise: Promise.resolve(document),
  destroy,
}));
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: unknown[]) => (getDocument as jest.Mock)(...args),
}));
jest.mock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({
  WorkerMessageHandler: {},
}));

it('loads PDF bytes, renders pages, supports zoom and cleans up', async () => {
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({} as CanvasRenderingContext2D);
  const result = render(
    <Theme>
      <DeveloperPDFPreview url="data:application/pdf;base64,JVBERi0=" />
    </Theme>
  );
  await screen.findByText('1 / 2');
  await waitFor(() => expect(draw).toHaveBeenCalled());
  expect(getDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.any(Uint8Array),
      isEvalSupported: false,
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(document.getPage).toHaveBeenCalledWith(2));
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  await waitFor(() =>
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.25 })
  );
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  result.unmount();
  expect(destroy).toHaveBeenCalledTimes(1);
});
