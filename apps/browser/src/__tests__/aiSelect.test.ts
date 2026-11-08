import { aiSelectValues, aiOptionRange } from '../browser/aiSelect';

it('accepts exact values or clearing and rejects invalid or duplicate values', () => {
  expect(aiSelectValues([])).toEqual([]);
  expect(aiSelectValues(['', 'b'])).toEqual(['', 'b']);
  [
    null,
    'a',
    ['a', 'a'],
    [3],
    Array(101).fill('a'),
    ['x'.repeat(1001)],
  ].forEach((values) => expect(() => aiSelectValues(values)).toThrow());
});

it('validates bounded option pagination', () => {
  expect(aiOptionRange({})).toEqual({ offset: 0, limit: 100 });
  expect(aiOptionRange({ offset: 200, limit: 25 })).toEqual({
    offset: 200,
    limit: 25,
  });
  [
    { offset: -1 },
    { offset: 1.5 },
    { limit: 0 },
    { limit: 201 },
    { offset: '200' },
  ].forEach((args) => expect(() => aiOptionRange(args)).toThrow());
});
