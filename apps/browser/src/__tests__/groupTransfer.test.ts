import { parsePortableGroup, PortableGroup } from '../browser/groupTransfer';

const data: PortableGroup = {
  format: 'kudiumbrowser-group',
  version: 1,
  name: 'Work',
  pages: [{ name: 'Example', url: 'https://example.com/', pinned: true }],
  developer: [
    {
      origin: 'https://example.com',
      config: { enabled: true, before: 'console.log(1)', after: '', css: '' },
    },
  ],
};
test('portable groups preserve pages and hook source for review', () => {
  expect(parsePortableGroup(JSON.parse(JSON.stringify(data)))).toEqual(data);
});
test.each([
  { ...data, version: 2 },
  { ...data, pages: [] },
  // eslint-disable-next-line no-script-url -- verifies unsupported URLs are rejected
  { ...data, pages: [{ name: 'Unsafe', url: 'javascript:alert(1)' }] },
  {
    ...data,
    developer: [
      { origin: 'https://example.com/path', config: data.developer[0].config },
    ],
  },
  {
    ...data,
    developer: [{ origin: 'https://example.com', config: { enabled: true } }],
  },
])('rejects invalid group files', (value) => {
  expect(() => parsePortableGroup(value)).toThrow('valid Kudium Browser group');
});
