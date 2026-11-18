import { cleanLink } from '../utils/cleanLink';

it('removes duplicate campaign parameters while preserving navigation and encoding', () => {
  expect(cleanLink('https://example.com/a%2Fb?q=a%20b&UTM_source=mail&utm_source=again&fbclid=123&tag=x%2By#part?utm_campaign=keep'))
    .toBe('https://example.com/a%2Fb?q=a%20b&tag=x%2By#part?utm_campaign=keep');
  expect(cleanLink('https://example.com/?gclid=1&utm_medium=email#article')).toBe('https://example.com/#article');
});
it('keeps signed URLs and meaningful application parameters unchanged', () => {
  const signed = 'https://example.com/download?utm_source=mail&X-Amz-Signature=abc&key=a%20b';
  expect(cleanLink(signed)).toBe(signed);
  const app = 'https://example.com/?source=project&ref=invite&code=auth&token=abc';
  expect(cleanLink(app)).toBe(app);
});
it('does not rewrite non-web schemes, malformed URLs or malformed parameter names', () => {
  expect(cleanLink('mailto:a@example.com?utm_source=mail')).toBe('mailto:a@example.com?utm_source=mail');
  expect(cleanLink('not a URL')).toBe('not a URL');
  expect(cleanLink('https://example.com/?%zz=value&utm_source=mail')).toBe('https://example.com/?%zz=value');
});
