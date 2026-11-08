import { installFocusModality } from '../utils/focusModality';

it('shows keyboard focus only after navigation and switches back on pointer input', () => {
  const cleanup = installFocusModality();
  const root = document.documentElement;
  expect(root.dataset.inputModality).toBe('pointer');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  expect(root.dataset.inputModality).toBe('keyboard');
  document.dispatchEvent(new Event('pointerdown'));
  expect(root.dataset.inputModality).toBe('pointer');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  expect(root.dataset.inputModality).toBe('pointer');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(root.dataset.inputModality).toBe('keyboard');
  cleanup();
  document.dispatchEvent(new Event('pointerdown'));
  expect(root.dataset.inputModality).toBeUndefined();
});
