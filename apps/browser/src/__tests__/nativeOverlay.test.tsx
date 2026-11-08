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
