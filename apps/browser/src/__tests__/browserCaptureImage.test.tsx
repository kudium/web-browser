import { fireEvent, render } from '@testing-library/react';
import { BrowserCaptureImage } from '../components/UI/BrowserCaptureImage';

it('omits missing and broken captures and recovers when a fresh capture arrives', () => {
  const { container, rerender } = render(<BrowserCaptureImage src="" alt="" />);
  expect(container.querySelector('img')).toBeNull();
  rerender(
    <BrowserCaptureImage
      src="broken-capture"
      alt=""
      className="browser-snapshot"
    />
  );
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull();
  rerender(<BrowserCaptureImage src="broken-capture" alt="" />);
  expect(container.querySelector('img')).toBeNull();
  rerender(<BrowserCaptureImage src="fresh-capture" alt="" />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe(
    'fresh-capture'
  );
});
