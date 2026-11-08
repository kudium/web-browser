import { aiWheel } from '../browser/aiWheel';

it('allows bounded scrolling on either or both axes', () => {
  expect(aiWheel({ deltaY: -200 })).toEqual({ deltaX: 0, deltaY: -200 });
  expect(aiWheel({ deltaX: 50, deltaY: 200 })).toEqual({
    deltaX: 50,
    deltaY: 200,
  });
  expect(aiWheel({ deltaX: 2000 })).toEqual({ deltaX: 2000, deltaY: 0 });
});
it('rejects zero, malformed and excessive deltas', () => {
  [
    {},
    { deltaY: 0 },
    { deltaY: 2001 },
    { deltaX: -2001 },
    { deltaY: NaN },
    { deltaY: Infinity },
    { deltaX: '100' },
  ].forEach((args) => expect(() => aiWheel(args)).toThrow());
});
