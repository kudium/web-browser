import { parseBrowserLinks } from '../browser/browserImport';

test('bookmark exports decode names, remove duplicates, and reject executable URLs', () => {
  expect(
    parseBrowserLinks(
      '<DL><DT><A HREF="https://example.com">Design &amp; research</A><A HREF="javascript:alert(1)">bad</A><A HREF="https://example.com/">duplicate</A><A HREF="file:///private">local</A></DL>',
      'html'
    )
  ).toEqual([{ name: 'Design & research', url: 'https://example.com/' }]);
});
test('pasted links support every source browser without accepting arbitrary text', () => {
  expect(
    parseBrowserLinks(
      'https://example.com\nhttps://other.example/path\nnot a url',
      'links'
    )
  ).toHaveLength(2);
  expect(() =>
    parseBrowserLinks('data:text/plain,not-a-web-link', 'links')
  ).toThrow('No web links');
});
test('oversized imports fail rather than silently dropping saved links', () => {
  expect(() =>
    parseBrowserLinks(
      Array.from({ length: 501 }, (_, i) => `https://example.com/${i}`).join(
        '\n'
      ),
      'links'
    )
  ).toThrow('500');
});
