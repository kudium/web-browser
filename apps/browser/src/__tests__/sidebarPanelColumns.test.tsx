import { act, render } from '@testing-library/react';
import { SidebarPanels } from '../components/UI/SidebarPanels';
import { browser } from '../browser/client';
jest.mock('../browser/client', () => ({
  browser: { sidebarPanels: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../components/UI/GroupPicker', () => ({ GroupPicker: () => null }));
jest.mock('../utils/hooks/useAppList', () => ({
  useAppList: () => ({ appList: [], lastIndex: 0 }),
}));

it('clips native content to the scrolling area and updates position without an intermediate hide', () => {
  jest.useFakeTimers();
  Object.assign(global, {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  const bounds = { x: 100, y: 100, width: 400, height: 400 };
  const spy = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const r = this.classList.contains('ai-sidebar-multi')
        ? { x: 200, y: 80, width: 300, height: 520 }
        : bounds;
      return {
        ...r,
        left: r.x,
        right: r.x + r.width,
        top: r.y,
        bottom: r.y + r.height,
        toJSON: () => r,
      };
    });
  const state = {
    panels: [{ id: 'native', title: 'Native', kind: 'feature' as const }],
    activeId: 'native',
    openRequest: 1,
    floating: false,
  };
  const view = render(
    <div className="ai-sidebar-multi">
      <SidebarPanels
        state={state}
        active
        onClose={() => {}}
        layoutVersion="panels,email"
      />
    </div>,
  );
  expect(browser.sidebarPanels).toHaveBeenLastCalledWith({
    action: 'layout',
    id: 'native',
    bounds: { x: 200, y: 100, width: 300, height: 400 },
  });
  (browser.sidebarPanels as jest.Mock).mockClear();
  bounds.x = 450;
  view.rerender(
    <div className="ai-sidebar-multi">
      <SidebarPanels
        state={state}
        active
        onClose={() => {}}
        layoutVersion="email,panels"
      />
    </div>,
  );
  act(() => jest.advanceTimersByTime(20));
  expect(browser.sidebarPanels).toHaveBeenCalledTimes(1);
  expect(browser.sidebarPanels).toHaveBeenLastCalledWith({
    action: 'layout',
    id: 'native',
    bounds: { x: 450, y: 100, width: 50, height: 400 },
  });
  bounds.x = 700;
  act(() => {
    document.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(20);
  });
  expect(browser.sidebarPanels).toHaveBeenLastCalledWith({
    action: 'layout',
    id: 'native',
    bounds: null,
  });
  view.unmount();
  spy.mockRestore();
  jest.useRealTimers();
});
