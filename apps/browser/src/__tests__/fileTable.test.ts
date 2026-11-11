import { parseFileTable } from '../utils/fileTable';

it('preserves quoted commas, escaped quotes, CRLF and multiline cells', () => {
  expect(
    parseFileTable('name,value\r\n"A,B","line 1\nline ""2"""\r\n', ',').rows
  ).toEqual([
    ['name', 'value'],
    ['A,B', 'line 1\nline "2"'],
  ]);
  expect(parseFileTable('a\tb\n1\t2', '\t').rows).toEqual([
    ['a', 'b'],
    ['1', '2'],
  ]);
});
it('bounds tables and reports omitted content', () => {
  expect(parseFileTable('row\n'.repeat(600), ',')).toMatchObject({
    truncated: true,
  });
  expect(parseFileTable('row\n'.repeat(600), ',').rows).toHaveLength(500);
});
