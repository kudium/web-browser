import { act, render, screen, waitFor } from '@testing-library/react';
import {
  hasGlobalOverlay,
  useNativeOverlay,
  useNativeOverlayPresentation,
} from '../utils/hooks/useNativeOverlay';

const visible = (element: HTMLElement) => {
  Object.defineProperty(element, 'getClientRects', {
    value: () => [{ width: 200 }],
    configurable: true,
  });
};
function Status({ surfaces }: { surfaces?: string }) {
  const open = useNativeOverlay(surfaces);
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
  },
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
  },
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
    ({ left: 200, right: 800, top: 50, bottom: 600 }) as DOMRect;
  content.getBoundingClientRect = () =>
    ({ left: 20, right: 180, top: 100, bottom: 140 }) as DOMRect;
  expect(hasGlobalOverlay(root)).toBe(false);
  content.getBoundingClientRect = () =>
    ({ left: 180, right: 300, top: 100, bottom: 140 }) as DOMRect;
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
      ({ left: 0, right: 600, top: 60, bottom: 700 }) as DOMRect;
    panel.getBoundingClientRect = () =>
      ({ left: 620, right: 1000, top: 100, bottom: 700 }) as DOMRect;
    menu.getBoundingClientRect = () =>
      ({ left: 700, right: 950, top: 70, bottom: 400 }) as DOMRect;
    expect(hasGlobalOverlay(root)).toBe(true);
    menu.dataset.state = 'closed';
    expect(hasGlobalOverlay(root)).toBe(false);
    menu.dataset.state = 'open';
    panel.hidden = true;
    Object.defineProperty(panel, 'getClientRects', { value: () => [] });
    expect(hasGlobalOverlay(root)).toBe(false);
  },
);

it('suspends only the native surface that a popup actually overlaps', () => {
  const root = document.createElement('div');
  root.innerHTML =
    '<div class="browser-viewport"></div><div class="sidebar-feature-content"></div><div data-radix-popper-content-wrapper><div data-state="open"></div></div>';
  const page = root.querySelector<HTMLElement>('.browser-viewport')!;
  const panel = root.querySelector<HTMLElement>('.sidebar-feature-content')!;
  const menu = root.querySelector<HTMLElement>('[data-state]')!;
  [page, panel, menu].forEach(visible);
  page.getBoundingClientRect = () =>
    ({ left: 200, right: 800, top: 60, bottom: 700 }) as DOMRect;
  panel.getBoundingClientRect = () =>
    ({ left: 820, right: 1200, top: 100, bottom: 700 }) as DOMRect;
  menu.getBoundingClientRect = () =>
    ({ left: 180, right: 350, top: 100, bottom: 300 }) as DOMRect;
  expect(hasGlobalOverlay(root, '.browser-viewport')).toBe(true);
  expect(hasGlobalOverlay(root, '.sidebar-feature-content')).toBe(false);
  menu.getBoundingClientRect = () =>
    ({ left: 900, right: 1100, top: 100, bottom: 300 }) as DOMRect;
  expect(hasGlobalOverlay(root, '.browser-viewport')).toBe(false);
  expect(hasGlobalOverlay(root, '.sidebar-feature-content')).toBe(true);
  panel.remove();
  expect(hasGlobalOverlay(root, '.sidebar-feature-content')).toBe(false);
});

it('rechecks overlap after scrolling and removing the native surface', async () => {
  render(<Status surfaces=".sidebar-feature-content" />);
  const panel = document.createElement('div');
  panel.className = 'sidebar-feature-content';
  visible(panel);
  panel.getBoundingClientRect = () =>
    ({ left: 820, right: 1200, top: 100, bottom: 700 }) as DOMRect;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-radix-popper-content-wrapper', '');
  const menu = document.createElement('div');
  menu.dataset.state = 'open';
  visible(menu);
  menu.getBoundingClientRect = () =>
    ({ left: 200, right: 400, top: 100, bottom: 300 }) as DOMRect;
  wrapper.append(menu);
  act(() => {
    document.body.append(panel, wrapper);
  });
  expect(screen.getByText('visible')).toBeTruthy();
  menu.getBoundingClientRect = () =>
    ({ left: 900, right: 1100, top: 100, bottom: 300 }) as DOMRect;
  act(() => document.dispatchEvent(new Event('scroll')));
  await screen.findByText('suspended');
  act(() => panel.remove());
  await screen.findByText('visible');
  wrapper.remove();
});

it('presents an overlapping popup only after all intersected native surfaces are ready and ignores stale acknowledgements', async () => {
  let ready!: (event: { surface: 'page' | 'panel'; token: number }) => void;
  const callbacks = new Set<typeof ready>();
  const subscribe = (callback: typeof ready) => {
    callbacks.add(callback);
    ready = (event) => callbacks.forEach((cb) => cb(event));
    return () => {
      callbacks.delete(callback);
    };
  };
  function Presentation() {
    const page = useNativeOverlayPresentation(
      '.browser-viewport',
      'page',
      subscribe,
    );
    const panel = useNativeOverlayPresentation(
      '.sidebar-feature-content',
      'panel',
      subscribe,
    );
    return (
      <span
        data-testid="tokens"
        data-page={page.token}
        data-panel={panel.token}
      />
    );
  }
  const view = render(<Presentation />);
  const page = document.createElement('div');
  page.className = 'browser-viewport';
  const panel = document.createElement('div');
  panel.className = 'sidebar-feature-content';
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-radix-popper-content-wrapper', '');
  const popup = document.createElement('div');
  popup.dataset.state = 'open';
  wrapper.append(popup);
  [page, panel, popup].forEach(visible);
  page.getBoundingClientRect = () =>
    ({ left: 0, right: 600, top: 60, bottom: 700 }) as DOMRect;
  panel.getBoundingClientRect = () =>
    ({ left: 620, right: 1000, top: 60, bottom: 700 }) as DOMRect;
  popup.getBoundingClientRect = () =>
    ({ left: 500, right: 800, top: 100, bottom: 400 }) as DOMRect;
  act(() => document.body.append(page, panel, wrapper));
  await waitFor(() => expect(popup.dataset.nativeOverlayPage).toBe('pending'));
  expect(popup.dataset.nativeOverlayPanel).toBe('pending');
  const pageToken = Number(screen.getByTestId('tokens').dataset.page);
  const panelToken = Number(screen.getByTestId('tokens').dataset.panel);
  act(() => ready({ surface: 'page', token: pageToken }));
  expect(popup.dataset.nativeOverlayPage).toBe('ready');
  expect(popup.dataset.nativeOverlayPanel).toBe('pending');
  act(() => ready({ surface: 'panel', token: panelToken }));
  expect(popup.dataset.nativeOverlayPanel).toBe('ready');
  act(() => {
    popup.dataset.state = 'closed';
  });
  await waitFor(() =>
    expect(popup.hasAttribute('data-native-overlay-page')).toBe(false),
  );
  act(() => {
    popup.dataset.state = 'open';
  });
  await waitFor(() => expect(popup.dataset.nativeOverlayPage).toBe('pending'));
  act(() => ready({ surface: 'page', token: pageToken }));
  expect(popup.dataset.nativeOverlayPage).toBe('pending');
  view.unmount();
  expect(callbacks.size).toBe(0);
  expect(popup.hasAttribute('data-native-overlay-page')).toBe(false);
  expect(popup.hasAttribute('data-native-overlay-panel')).toBe(false);
  page.remove();
  panel.remove();
  wrapper.remove();
});


it.each(['select', 'custom'])('detects %s overlays without a Radix popper wrapper and restores the surface when they close', async kind => {
  render(<Status surfaces=".browser-viewport" />);
  const page=document.createElement('div');page.className='browser-viewport';visible(page);
  page.getBoundingClientRect=()=>({left:200,right:800,top:70,bottom:700} as DOMRect);
  const popup=document.createElement('div');visible(popup);
  popup.getBoundingClientRect=()=>({left:300,right:600,top:50,bottom:200} as DOMRect);
  if(kind==='select'){popup.className='rt-SelectContent';popup.dataset.state='open';}
  else popup.setAttribute('data-native-overlay-content','');
  act(()=>document.body.append(page,popup));
  await screen.findByText('suspended');
  act(()=>{popup.hidden=true;});await screen.findByText('visible');
  act(()=>{popup.hidden=false;});await screen.findByText('suspended');
  act(()=>popup.remove());await screen.findByText('visible');page.remove();
});
