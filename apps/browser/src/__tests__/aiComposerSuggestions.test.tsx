import { PanelOverlayProvider } from '../components/UI/PanelDialog';
import '@testing-library/jest-dom';
import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { AIComposerSuggestions } from '../components/UI/AIComposerSuggestions';

it('anchors beneath the caret and follows textarea scrolling without occupying composer space', () => {
  const textarea = document.createElement('textarea');
  textarea.style.lineHeight = '20px';
  document.body.appendChild(textarea);
  const input = createRef<HTMLTextAreaElement>();
  Object.assign(input, { current: textarea });
  const geometry = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      return (
        this === textarea
          ? { top: 100, bottom: 300, left: 40 }
          : { top: 40, left: 60 }
      ) as DOMRect;
    });
  const { container, unmount } = render(
    <AIComposerSuggestions
      input={input}
      cursor={3}
      value={'\n@w'}
      selectedIndex={0}
    >
      <div role="listbox">Work</div>
    </AIComposerSuggestions>
  );
  const popup = document.querySelector(
    '.ai-composer-suggestions'
  ) as HTMLElement;
  expect(container).toBeEmptyDOMElement();
  expect(popup.style.top).toBe('166px');
  expect(popup.style.left).toBe('100px');
  textarea.scrollTop = 20;
  fireEvent.scroll(textarea);
  expect(popup.style.top).toBe('146px');
  unmount();
  textarea.remove();
  geometry.mockRestore();
});

it('uses panel coordinates inside a contained overlay and enables pointer interaction', () => {
  const textarea = document.createElement('textarea');
  textarea.style.lineHeight = '20px';
  document.body.appendChild(textarea);
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  const input = createRef<HTMLTextAreaElement>();
  Object.assign(input, { current: textarea });
  const geometry = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this === overlay)
        return { top: 100, left: 600, width: 368, height: 600 } as DOMRect;
      if (this === textarea)
        return { top: 580, bottom: 640, left: 620 } as DOMRect;
      return { top: 0, left: 0 } as DOMRect;
    });
  const { unmount } = render(
    <PanelOverlayProvider container={overlay}>
      <AIComposerSuggestions
        input={input}
        cursor={1}
        value="/"
        selectedIndex={0}
      >
        <div role="listbox">Files</div>
      </AIComposerSuggestions>
    </PanelOverlayProvider>
  );
  const popup = overlay.querySelector(
    '.ai-composer-suggestions'
  ) as HTMLElement;
  expect(popup.style.position).toBe('absolute');
  expect(popup.style.left).toBe('8px');
  expect(popup.style.top).toBe('474px');
  expect(popup.style.transform).toBe('translateY(-100%)');
  expect(popup.style.pointerEvents).toBe('auto');
  unmount();
  textarea.remove();
  overlay.remove();
  geometry.mockRestore();
});
