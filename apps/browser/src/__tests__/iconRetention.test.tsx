import { act, render, screen } from '@testing-library/react';
import { AppIcon } from '../components/UI/AppIcon/AppIcon';
import { retainExtensionIcons } from '../browser/extensionIconRetention';

it('clears the previous website icon on an explicit reset', () => {
  const images: HTMLImageElement[] = [];
  const Original = window.Image;
  window.Image = jest.fn(() => {
    const image = document.createElement('img');
    images.push(image);
    return image;
  }) as unknown as typeof Image;
  try {
    const view = render(<AppIcon icon="old.png" title="Website" />);
    act(() => images[0].dispatchEvent(new Event('load')));
    expect(screen.getByRole('img').getAttribute('src')).toBe('old.png');
    view.rerender(<AppIcon icon="failed-replacement.png" title="Website" />);
    expect(screen.queryByRole('img')).toBeNull();
    act(() => images[1].dispatchEvent(new Event('error')));
    expect(screen.queryByRole('img')).toBeNull();
    view.rerender(<AppIcon icon="" title="Website" />);
    expect(screen.queryByRole('img')).toBeNull();
    view.rerender(<AppIcon icon="failed.png" title="Website" />);
    act(() => images[2].dispatchEvent(new Event('error')));
    expect(screen.queryByRole('img')).toBeNull();
    view.rerender(<AppIcon icon="new.png" title="Website" />);
    act(() => images[3].dispatchEvent(new Event('load')));
    expect(screen.getByRole('img').getAttribute('src')).toBe('new.png');
  } finally {
    window.Image = Original;
  }
});

it('keeps a working extension icon when its next refresh fails', () => {
  class Action extends HTMLElement {
    partition = 'personal';

    pendingIcon?: HTMLImageElement;

    updateIcon() {
      const image = document.createElement('img');
      this.pendingIcon = image;
      image.onload = () => {
        this.style.backgroundImage = 'url("crx://working")';
      };
      image.onerror = () => {
        this.classList.add('no-icon');
      };
    }
  }
  customElements.define('browser-action', Action);
  retainExtensionIcons();
  const action = new Action();
  action.id = 'extension';
  document.body.appendChild(action);
  action.updateIcon();
  action.pendingIcon!.dispatchEvent(new Event('load'));
  action.updateIcon();
  action.pendingIcon!.dispatchEvent(new Event('error'));
  expect(action.classList.contains('no-icon')).toBe(false);
  expect(action.style.backgroundImage).toContain('crx://working');
  action.remove();
});
