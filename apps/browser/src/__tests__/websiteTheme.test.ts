import { websiteThemeStyle } from '../utils/websiteTheme';

it('accepts resolved RGB colors and rejects arbitrary page CSS', () => {
  expect(websiteThemeStyle('#4285F4')).toEqual({
    '--website-color': '#4285F4',
  });
  for (const color of [
    undefined,
    '',
    'red',
    'transparent',
    '#123',
    'url(https://example.com)',
    '#123456; color:red',
  ]) {
    expect(websiteThemeStyle(color)).toBeUndefined();
  }
});
