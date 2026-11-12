import { render, act } from '@testing-library/react';
import { useAppearance, setAppearance } from '../utils/appearance';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({ browser: { nativeAppearance: jest.fn(() => Promise.resolve()) } }));
function Probe() { const { appearance } = useAppearance(); return <span>{appearance}</span>; }
test('keeps native material synchronized with selected light, dark and system appearances', () => {
  localStorage.setItem('kudiumbrowser-appearance', 'light');
  window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  render(<Probe />);
  expect(browser.nativeAppearance).toHaveBeenLastCalledWith('light');
  act(() => setAppearance('dark'));
  expect(browser.nativeAppearance).toHaveBeenLastCalledWith('dark');
  act(() => setAppearance('system'));
  expect(browser.nativeAppearance).toHaveBeenLastCalledWith('system');
});
