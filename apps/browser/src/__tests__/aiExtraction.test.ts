import { aiExtraction, extractAIPage } from '../browser/aiExtraction';

beforeEach(() => {
  document.body.innerHTML = '';
  jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as any);
});
afterEach(() => jest.restoreAllMocks());

const request = (args: Record<string, unknown> = {}) =>
  aiExtraction({
    selector: 'article',
    columns: [{ name: 'title', selector: 'h2' }],
    ...args,
  });

it('extracts nested open components and assigned slots once in rendered order', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.innerHTML =
    '<article slot="rows"><h2>Slotted</h2></article><article><h2>Unassigned secret</h2></article>';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<article><div id="details"></div></article><slot name="rows"><article><h2>Unused fallback</h2></article></slot><slot name="empty"><article><h2>Fallback</h2></article></slot>';
  root.querySelector('#details')!.attachShadow({ mode: 'open' }).innerHTML =
    '<h2>Nested <span hidden>Secret</span></h2><a href="https://example.com/nested">Visit</a>';
  const page = extractAIPage(request({ limit: 2 }));
  expect(page.rows).toEqual([{ title: 'Nested' }, { title: 'Slotted' }]);
  expect(page.hasMore).toBe(true);
  expect(extractAIPage(request({ offset: page.nextOffset })).rows).toEqual([
    { title: 'Fallback' },
  ]);
  expect(extractAIPage(request({ offset: 2 })).hasMore).toBe(false);
  expect(
    extractAIPage(
      request({ columns: [{ name: 'url', selector: 'a', attribute: 'href' }] })
    ).rows[0]
  ).toEqual({ url: 'https://example.com/nested' });
});

it('does not extract content hidden through a shadow host or assigned slot', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.attachShadow({ mode: 'open' }).innerHTML =
    '<article><h2>Hidden host</h2></article>';
  host.hidden = true;
  expect(extractAIPage(request()).rows).toEqual([]);
  host.hidden = false;
  host.innerHTML = '<article slot="rows"><h2>Hidden slot</h2></article>';
  host.shadowRoot!.innerHTML = '<slot name="rows" hidden></slot>';
  expect(extractAIPage(request()).rows).toEqual([]);
  host.shadowRoot!.innerHTML =
    '<article style="opacity:0"><h2>Transparent</h2></article>';
  expect(extractAIPage(request()).rows).toEqual([]);
});

it('paginates visible rows and excludes hidden fields and form secrets', () => {
  document.body.innerHTML = `<article><h2>First</h2></article>
    <article hidden><h2>Hidden row</h2></article>
    <article><h2>Second <span hidden>Secret</span><input type="password" value="private"><textarea>private</textarea></h2><a href="https://example.com/item">Link</a></article>
    <article><h2>Third</h2></article>`;
  const page = extractAIPage(request({ offset: 1, limit: 1 }));
  expect(page.rows).toEqual([{ title: 'Second' }]);
  expect(page.nextOffset).toBe(2);
  expect(page.hasMore).toBe(true);
  expect(extractAIPage(request({ offset: 2 })).rows).toEqual([
    { title: 'Third' },
  ]);
  expect(extractAIPage(request({ offset: 2 })).hasMore).toBe(false);
});

it('returns only ordinary HTTP links and null for missing or hidden fields', () => {
  document.body.innerHTML = `<article><a href="https://example.com/item">Link</a></article>
    <article><a href="javascript:alert(1)">Unsafe</a></article>
    <article><a href="https://user:secret@example.com">Credentials</a></article>
    <article><a hidden href="https://example.com/hidden">Hidden</a></article>
    <article><a href="http://[">Malformed</a></article>
    <article><a href="https://example.com/${'x'.repeat(
      1001
    )}">Long</a></article>`;
  expect(
    extractAIPage(
      request({ columns: [{ name: 'url', selector: 'a', attribute: 'href' }] })
    ).rows
  ).toEqual([
    { url: 'https://example.com/item' },
    { url: null },
    { url: null },
    { url: null },
    { url: null },
    { url: null },
  ]);
});

it('caps individual cells and total text without exposing script text', () => {
  document.body.innerHTML = Array.from(
    { length: 100 },
    () =>
      `<article><h2>${'A'.repeat(2000)}<script>secret</script></h2></article>`
  ).join('');
  const page = extractAIPage(request());
  expect(page.rows).toHaveLength(50);
  expect(page.rows.every((row) => row.title?.length === 1000)).toBe(true);
  expect(page.coverage.textTruncated).toBe(true);
  expect(page.coverage.outputLimitReached).toBe(true);
  expect(page.hasMore).toBe(true);
});

it('validates schemas and selectors rather than evaluating supplied code', () => {
  expect(() => request({ selector: '' })).toThrow('Selectors');
  expect(() => request({ limit: 201 })).toThrow('limit');
  expect(() =>
    request({ columns: [{ name: 'x', attribute: 'value' }] })
  ).toThrow();
  expect(() => request({ columns: [{ name: 'x' }, { name: 'x' }] })).toThrow();
  expect(() =>
    request({ columns: [{ name: 'x', script: 'alert(1)' }] })
  ).toThrow();
  expect(() => extractAIPage(request({ selector: '[' }))).toThrow();
  expect(() =>
    extractAIPage(request({ columns: [{ name: 'x', selector: '[' }] }))
  ).toThrow();
  expect(() => request({ columns: [] })).toThrow();
  expect(request().columns).toEqual([
    { name: 'title', selector: 'h2', attribute: 'text' },
  ]);
});
