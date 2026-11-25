import { reorderCollections } from '../utils/collectionOrder';
const collections = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, focusColor: '#abcdef' }));
it.each([
  ['a', 'c', false, ['b', 'a', 'c', 'd']],
  ['a', 'c', true, ['b', 'c', 'a', 'd']],
  ['d', 'a', false, ['d', 'a', 'b', 'c']],
  ['d', 'b', true, ['a', 'b', 'd', 'c']],
] as const)('moves %s around %s without changing collection identities', (source, target, after, expected) => {
  const next = reorderCollections(collections, source, target, after);
  expect(next.map(item => item.id)).toEqual(expected);
  expect(collections.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
  next.forEach(item => expect(item).toBe(collections.find(original => original.id === item.id)));
});
it('ignores invalid, same-item and unchanged moves', () => {
  expect(reorderCollections(collections, 'missing', 'a', true)).toBe(collections);
  expect(reorderCollections(collections, 'a', 'missing', true)).toBe(collections);
  expect(reorderCollections(collections, 'a', 'a', true)).toBe(collections);
  expect(reorderCollections(collections, 'a', 'b', false)).toBe(collections);
});
