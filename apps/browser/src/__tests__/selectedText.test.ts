import { selectedTextMarkdown } from '../browser/selectedText';
function select(html: string, start?: number, end?: number) {
  document.body.innerHTML = html;
  const range = document.createRange();
  if (start !== undefined) {
    const node = document.querySelector('a')!.firstChild!;
    range.setStart(node,start);range.setEnd(node,end!);
  } else range.selectNodeContents(document.body);
  const selection = window.getSelection()!;
  selection.removeAllRanges();selection.addRange(range);
  return selection.toString();
}
test('captures multiple labeled relative and absolute links as Markdown without page HTML', () => {
  const text=select('Barcelona is in <a href="https://example.com/Spain">España</a> and <a href="/Catalonia">Cataluña</a>.');
  const result=selectedTextMarkdown(text)!;
  expect(result.text).toBe(text);
  expect(result.markdown).toContain('[España](https://example.com/Spain)');
  expect(result.markdown).toContain(`[Cataluña](${new URL('/Catalonia',document.baseURI).href})`);
  expect(result.markdown).not.toContain('<a');
});
test('preserves the destination of a partially selected link label', () => {
  const text=select('<a href="https://example.com">España</a>',1,5);
  expect(selectedTextMarkdown(text)?.markdown).toBe('[spañ](https://example.com/)');
});
test('rejects stale selections and unsafe or credential-bearing destinations', () => {
  const text=select('<a href="javascript:alert(1)">Unsafe</a> <a href="https://user:secret@example.com">Private</a>');
  expect(selectedTextMarkdown(text)).toBeUndefined();
  expect(selectedTextMarkdown('different')).toBeUndefined();
});
test('escapes label Markdown and encodes destination parentheses', () => {
  const text=select('<a href="https://example.com/a(b)">[Example]*</a>');
  expect(selectedTextMarkdown(text)?.markdown).toBe('[\\[Example\\]\\*](https://example.com/a%28b%29)');
});

test('preserves bold and italic formatting without copying HTML', () => {
  const text=select('<strong>Barcelona</strong> in <em>Cataluña</em>');
  expect(selectedTextMarkdown(text)?.markdown).toBe('**Barcelona** in _Cataluña_');
});
