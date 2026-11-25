import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HorizontalTabList } from '../components/UI/HorizontalTabList';
import { Theme } from '@radix-ui/themes';

jest.mock('../browser/client', () => ({
  browser: {
    nativeMenu: jest.fn(),
    showTooltip: jest.fn(),
    hideTooltip: jest.fn(),
  },
}));

const tabs = [
  { id: 'a', title: 'First' },
  { id: 'b', title: 'Second' },
];

beforeEach(() => {
  Object.defineProperty(global, 'ResizeObserver', {
    configurable: true,
    value: jest.fn(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() })),
  });
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function rect(this: HTMLElement) {
      const left = Number(this.getAttribute('data-left') || 0);
      return {
        left,
        right: left + 100,
        top: 0,
        bottom: 30,
        width: 100,
        height: 30,
        x: left,
        y: 0,
        toJSON: () => ({}),
      };
    });
});
afterEach(() => jest.restoreAllMocks());

it('lists clipped tabs and selects the chosen overflow tab', async () => {
  const select = jest.fn();
  render(
    <Theme>
      <HorizontalTabList mode="dropdown" tabs={tabs} onSelect={select}>
        <div className="horizontal-tab" />
        <div className="horizontal-tab" data-left="100" />
      </HorizontalTabList>
    </Theme>
  );
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Show overflow tabs' }),
    { key: 'ArrowDown' }
  );
  const hiddenTab = await screen.findByRole('menuitem', { name: 'Second' });
  expect(hiddenTab.querySelector('.app-icon')).not.toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'First' })).toBeNull();
  fireEvent.click(hiddenTab);
  await waitFor(() => expect(select).toHaveBeenCalledWith('b'));
});

it('keeps the dropdown hidden in scroll mode', async () => {
  const { container } = render(
    <HorizontalTabList mode="scroll" tabs={tabs} onSelect={() => {}}>
      <div className="horizontal-tab" />
      <div className="horizontal-tab" data-left="100" />
    </HorizontalTabList>
  );
  expect(
    screen.queryByRole('button', { name: 'Show overflow tabs' })
  ).toBeNull();
  const strip = container.querySelector('[data-overflow="scroll"]')!;
  expect(strip.getAttribute('data-fade-left')).toBe('false');
  expect(strip.getAttribute('data-fade-right')).toBe('true');
  const nodes = strip.querySelectorAll('.horizontal-tab');
  nodes[0].setAttribute('data-left', '-100');
  nodes[1].setAttribute('data-left', '0');
  fireEvent.scroll(strip);
  await waitFor(() => expect(strip.getAttribute('data-fade-left')).toBe('true'));
  expect(strip.getAttribute('data-fade-right')).toBe('false');
});
