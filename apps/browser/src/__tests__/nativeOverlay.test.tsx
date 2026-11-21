import { act, render, screen, waitFor } from '@testing-library/react';
import {
  hasGlobalOverlay,
  useNativeOverlay,
} from '../utils/hooks/useNativeOverlay';

const visible = (element: HTMLElement) => {
  Object.defineProperty(element, 'getClientRects', {
    value: () => [{ width: 200 }],
    configurable: true,
  });
};
function Status() {
  const open = useNativeOverlay();
  return <span>{open ? 'suspended' : 'visible'}</span>;
}
it('suspends native pages for global portals, ignores scoped portals, and resumes on dismissal', async () => {
  render(<Status />);
  const layer = document.createElement('div');
  layer.className = 'ai-overlay-layer';
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-radix-popper-content-wrapper', '');
  const menu = document.createElement('div');
  menu.dataset.state = 'open';
  visible(menu);
  wrapper.append(menu);
  layer.append(wrapper);
  act(() => document.body.append(layer));
  expect(hasGlobalOverlay()).toBe(false);
  expect(screen.getByText('visible')).toBeTruthy();
  act(() => document.body.append(wrapper));
  await screen.findByText('suspended');
  act(() => {
    menu.dataset.state = 'closed';
  });
  await screen.findByText('visible');
  const dialog = document.createElement('div');
  dialog.className = 'rt-BaseDialogOverlay';
  dialog.dataset.state = 'open';
  visible(dialog);
  act(() => document.body.append(dialog));
  await screen.findByText('suspended');
  act(() => dialog.remove());
  await waitFor(() => expect(screen.getByText('visible')).toBeTruthy());
  wrapper.remove();
  layer.remove();
});
it('ignores hidden and unpositioned popovers', () => {
  const root = document.createElement('div');
  root.innerHTML =
    '<div data-radix-popper-content-wrapper><div data-state="open"></div></div>';
  expect(hasGlobalOverlay(root)).toBe(false);
  const content = root.querySelector<HTMLElement>('[data-state]')!;
  visible(content);
  content.hidden = true;
  expect(hasGlobalOverlay(root)).toBe(false);
});

it.each(['react-refresh-overlay', 'webpack-dev-server-client-overlay'])(
  'suspends native website views while development error overlay %s is visible',
  async (id) => {
    render(<Status />);
    const overlay = document.createElement('iframe');
    overlay.id = id;
    visible(overlay);
    act(() => document.body.append(overlay));
    await screen.findByText('suspended');
    act(() => {
      overlay.hidden = true;
    });
    await screen.findByText('visible');
    act(() => {
      overlay.hidden = false;
    });
    await screen.findByText('suspended');
    act(() => overlay.remove());
    await screen.findByText('visible');
  }
);

it.each(['delayed-open', 'instant-open'])(
  'suspends native pages for visible tooltip state %s and resumes on close',
  async (state) => {
    render(<Status />);
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-radix-popper-content-wrapper', '');
    const tooltip = document.createElement('div');
    tooltip.dataset.state = state;
    visible(tooltip);
    wrapper.append(tooltip);
    act(() => document.body.append(wrapper));
    await screen.findByText('suspended');
    expect(hasGlobalOverlay()).toBe(true);
    act(() => {
      tooltip.dataset.state = 'closed';
    });
    await screen.findByText('visible');
    act(() => wrapper.remove());
  }
);

it('keeps sidebar hints and popovers outside the page from suspending native views', () => {
  const root = document.createElement('div');
  root.innerHTML =
    '<div class="browser-viewport"></div><div data-radix-popper-content-wrapper><div data-state="open"></div></div>';
  const viewport = root.querySelector<HTMLElement>('.browser-viewport')!;
  const content = root.querySelector<HTMLElement>('[data-state]')!;
  visible(viewport);
  visible(content);
  viewport.getBoundingClientRect = () =>
    ({ left: 200, right: 800, top: 50, bottom: 600 } as DOMRect);
  content.getBoundingClientRect = () =>
    ({ left: 20, right: 180, top: 100, bottom: 140 } as DOMRect);
  expect(hasGlobalOverlay(root)).toBe(false);
  content.getBoundingClientRect = () =>
    ({ left: 180, right: 300, top: 100, bottom: 140 } as DOMRect);
  expect(hasGlobalOverlay(root)).toBe(true);
  content.className = 'sidebar-tooltip';
  expect(hasGlobalOverlay(root)).toBe(false);
});

it.each(['', 'ai-overlay-layer'])(
  'suspends for menus overlapping a native panel, including scoped portals (%s)',
  (scope) => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="browser-viewport"></div><div class="sidebar-feature-content"></div><div class="${scope}"><div data-radix-popper-content-wrapper><div data-state="open"></div></div></div>`;
    const page = root.querySelector<HTMLElement>('.browser-viewport')!;
    const panel = root.querySelector<HTMLElement>('.sidebar-feature-content')!;
    const menu = root.querySelector<HTMLElement>('[data-state]')!;
    [page, panel, menu].forEach(visible);
    page.getBoundingClientRect = () =>
      ({ left: 0, right: 600, top: 60, bottom: 700 } as DOMRect);
    panel.getBoundingClientRect = () =>
      ({ left: 620, right: 1000, top: 100, bottom: 700 } as DOMRect);
    menu.getBoundingClientRect = () =>
      ({ left: 700, right: 950, top: 70, bottom: 400 } as DOMRect);
    expect(hasGlobalOverlay(root)).toBe(true);
    menu.dataset.state = 'closed';
    expect(hasGlobalOverlay(root)).toBe(false);
    menu.dataset.state = 'open';
    panel.hidden = true;
    Object.defineProperty(panel, 'getClientRects', { value: () => [] });
    expect(hasGlobalOverlay(root)).toBe(false);
  }
);
