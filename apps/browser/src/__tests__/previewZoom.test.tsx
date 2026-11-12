import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { usePreviewZoom } from '../utils/hooks/usePreviewZoom';

function Preview() {
  const [zoom, setZoom] = useState(1);
  const ref = usePreviewZoom(zoom, setZoom);
  return (
    <div ref={ref} data-testid="preview">
      {zoom}
    </div>
  );
}
it('zooms on trackpad pinch without consuming ordinary scroll and clamps the scale', () => {
  render(<Preview />);
  const preview = screen.getByTestId('preview');
  const scroll = new WheelEvent('wheel', {
    deltaY: 100,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(preview, scroll);
  expect(scroll.defaultPrevented).toBe(false);
  expect(preview.textContent).toBe('1');
  const pinch = new WheelEvent('wheel', {
    deltaY: -1000,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(preview, pinch);
  expect(pinch.defaultPrevented).toBe(true);
  expect(preview.textContent).toBe('4');
  fireEvent.wheel(preview, { deltaY: 1000, ctrlKey: true });
  expect(preview.textContent).toBe('0.25');
});
it('uses two-finger distance and clears the gesture when a finger is lifted', () => {
  render(<Preview />);
  const preview = screen.getByTestId('preview');
  const touches = (distance: number) => [
    { clientX: 0, clientY: 0 },
    { clientX: distance, clientY: 0 },
  ];
  fireEvent.touchStart(preview, { touches: touches(100) });
  fireEvent.touchMove(preview, { touches: touches(200) });
  expect(preview.textContent).toBe('2');
  fireEvent.touchEnd(preview, { touches: [] });
  fireEvent.touchStart(preview, { touches: touches(100) });
  expect(preview.textContent).toBe('2');
});
