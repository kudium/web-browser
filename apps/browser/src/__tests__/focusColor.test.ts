import {
  focusColorStyle,
  normalizeFocusColor,
  itemFocusColor,
} from '../utils/focusColor';
import { isBrowserLayout } from '../main/browserRequests';

it('keeps group and tab highlights independent, including when a color is cleared', () => {
  const item = { focusColor: '#112233', sessionFocusColor: '#445566' };
  expect(itemFocusColor(item, 'tab')).toBe('#112233');
  expect(itemFocusColor(item, 'group')).toBe('#445566');
  expect(
    itemFocusColor({ ...item, focusColor: undefined }, 'tab')
  ).toBeUndefined();
  expect(
    itemFocusColor({ ...item, sessionFocusColor: undefined }, 'group')
  ).toBeUndefined();
  expect(itemFocusColor({}, 'tab')).toBeUndefined();
  expect(itemFocusColor({}, 'group')).toBeUndefined();
  expect(focusColorStyle(undefined)).toBeUndefined();
  expect(normalizeFocusColor('#ABCDEF')).toBe('#abcdef');
});
it.each([
  'red',
  '#123',
  '#12345678',
  'var(--color)',
  'url(https://example.com)',
  123,
  null,
])('rejects unsafe or unsupported colors: %s', (value) => {
  expect(normalizeFocusColor(value)).toBeUndefined();
  expect(focusColorStyle(value)).toBeUndefined();
});
it('keeps selected-item labels readable on light and dark custom backgrounds', () => {
  expect(focusColorStyle('#ffffff')).toMatchObject({
    '--item-focus-color': '#ffffff',
    '--item-focus-contrast': '#102b29',
  });
  expect(focusColorStyle('#000000')).toMatchObject({
    '--item-focus-color': '#000000',
    '--item-focus-contrast': '#ffffff',
  });
});
it('validates highlight colors at the renderer layout boundary', () => {
  const tab = { id: 'tab', name: 'Tab', url: 'https://example.com' };
  expect(
    isBrowserLayout({
      apps: [{ ...tab, focusColor: '#ABCDEF', sessionFocusColor: '#123456' }],
      visible: [],
    })
  ).toBe(true);
  expect(
    isBrowserLayout({ apps: [{ ...tab, focusColor: 'red' }], visible: [] })
  ).toBe(false);
  expect(
    isBrowserLayout({ apps: [{ ...tab, sessionFocusColor: {} }], visible: [] })
  ).toBe(false);
});
