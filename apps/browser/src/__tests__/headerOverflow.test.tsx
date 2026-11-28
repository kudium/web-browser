import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AssistantPageHeader } from '../components/UI/AssistantPageHeader';
import { PanelDockButton } from '../components/UI/PanelDockButton';
import { browser } from '../browser/client';
jest.mock('../browser/client', () => ({
  browser: {
    nativeMenu: jest.fn(),
    tooltip: jest.fn().mockResolvedValue(undefined),
  },
}));
let width = 180;
let resized!: ResizeObserverCallback;
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  width = 180;
  Object.assign(global, {
    ResizeObserver: class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  });
  jest
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('assistant-page-header') ? width : 0;
    });
  jest
    .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('assistant-page-header')) return 0;
      return (
        100 +
        [
          ...this.querySelectorAll<HTMLElement>('button, .panel-dock-button'),
        ].filter((node) => !node.hidden).length *
          40
      );
    });
});
afterEach(() => jest.restoreAllMocks());

it('keeps primary controls visible, opens More lazily, invokes original actions and restores controls when widened', async () => {
  const action = jest.fn(),
    close = jest.fn();
  const view = render(
    <Theme>
      <AssistantPageHeader>
        <h2>Activity</h2>
        <button onClick={action}>Mark all read</button>
        <button disabled>Clear all</button>
        <PanelDockButton />
        <button data-header-essential onClick={close}>
          Close
        </button>
      </AssistantPageHeader>
    </Theme>,
  );
  const mark = screen.getByText('Mark all read'),
    more = screen.getByRole('button', { name: 'More panel options' });
  expect(screen.getByText('Close')).toBeVisible();
  expect(mark).not.toBeVisible();
  expect(browser.nativeMenu).not.toHaveBeenCalled();
  (browser.nativeMenu as jest.Mock).mockImplementation((items) =>
    Promise.resolve(
      items.find((item: { label: string }) => item.label === 'Mark all read')
        ?.id,
    ),
  );
  await act(async () => fireEvent.click(more));
  expect(action).toHaveBeenCalledTimes(1);
  expect(browser.nativeMenu).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Clear all', enabled: false }),
    ]),
  );
  width = 600;
  act(() => resized([], {} as ResizeObserver));
  await waitFor(() => expect(more).not.toBeVisible());
  expect(screen.getByText('Mark all read')).toBe(mark);
  expect(mark).toBeVisible();
  view.unmount();
});

it('routes dock choices through the existing select change handler', async () => {
  width = 150;
  render(
    <Theme>
      <AssistantPageHeader>
        <h2>Chat</h2>
        <PanelDockButton />
        <button data-header-essential>Close</button>
      </AssistantPageHeader>
    </Theme>,
  );
  (browser.nativeMenu as jest.Mock).mockImplementation((items) =>
    Promise.resolve(
      items
        .flatMap(
          (item: { submenu?: Array<{ id: string; label: string }> }) =>
            item.submenu || [],
        )
        .find((item: { label: string }) => item.label === 'Dock panels bottom')
        ?.id,
    ),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'More panel options' })),
  );
  expect(localStorage.getItem('kudium-panel-dock')).toBe('bottom');
});

it('ignores stale choices after a control disappears or becomes disabled', async () => {
  let choose!: (choice: string) => void;
  const action = jest.fn();
  (browser.nativeMenu as jest.Mock).mockImplementation(
    () =>
      new Promise((resolve) => {
        choose = resolve;
      }),
  );
  const page = (disabled: boolean) => (
    <Theme>
      <AssistantPageHeader>
        <h2>Chat</h2>
        <button onClick={action} disabled={disabled}>
          Create
        </button>
        <button data-header-essential>Close</button>
        <button>Secondary</button>
      </AssistantPageHeader>
    </Theme>
  );
  const view = render(page(false));
  fireEvent.click(screen.getByRole('button', { name: 'More panel options' }));
  const items = (browser.nativeMenu as jest.Mock).mock.calls[0][0];
  view.rerender(page(true));
  await act(async () =>
    choose(items.find((item: { label: string }) => item.label === 'Create').id),
  );
  expect(action).not.toHaveBeenCalled();
});

it('collapses overlapping flex controls even when scrollWidth says the header fits', () => {
  width = 600;
  jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function(this: HTMLElement) {
    return (this.hidden ? [] : [this.getBoundingClientRect()]) as unknown as DOMRectList;
  });
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const name = this.getAttribute('aria-label') || this.textContent;
    const left = this.tagName === 'H2' ? 0 : name === 'Close' ? 565 : name === 'More panel options' ? 530 : name === 'Secondary' ? 550 : 0;
    const size = this.classList.contains('assistant-page-header') ? 600 : this.tagName === 'H2' ? 80 : 26;
    return { x: left, y: 0, left, right: left + size, top: 0, bottom: 26, width: size, height: 26, toJSON: () => ({}) };
  });
  render(<Theme><AssistantPageHeader><h2>Activity</h2><button>Secondary</button><button data-header-essential>Close</button></AssistantPageHeader></Theme>);
  expect(screen.getByText('Secondary')).not.toBeVisible();
  expect(screen.getByRole('button', { name: 'More panel options' })).toBeVisible();
  expect(screen.getByText('Close')).toBeVisible();
});
