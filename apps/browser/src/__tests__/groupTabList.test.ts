import { editGroupTabList } from '../utils/groupTabList';

const rows = [
  { id: 'a', name: 'First', url: 'https://a.com/' },
  { id: 'b', name: 'Second', url: 'https://b.com/' },
];
const changes = { edits: {}, added: [], removed: [] };
it('preserves the remaining tab when deleting the first line', () => {
  const result = editGroupTabList('b.com', rows, ['a', 'b'], changes);
  expect(result.removed).toEqual(['a']);
  expect(result.order).toEqual(['b']);
  expect(result.edits.b.url).toBe('b.com');
});
it('keeps names and identities when reordering or inserting lines', () => {
  const result = editGroupTabList(
    'b.com\nnew.com\na.com',
    rows,
    ['a', 'b'],
    changes
  );
  expect(result.order?.[0]).toBe('b');
  expect(result.order?.[2]).toBe('a');
  expect(result.added).toHaveLength(1);
  expect(result.added[0].name).toBe('');
  expect(result.removed).toEqual([]);
});

it('keeps an added tab icon and focus color when switching through the text list', () => {
  const added = { id: 'new', name: 'New', url: 'https://new.com', customIconEmoji: '🌱', focusColor: '#123456' };
  const result = editGroupTabList('new.com', [added], [], { edits: {}, added: [added], removed: [] });
  expect(result.added[0]).toMatchObject({ id: 'new', customIconEmoji: '🌱', focusColor: '#123456' });
});
