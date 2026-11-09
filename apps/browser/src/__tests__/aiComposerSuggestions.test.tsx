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
