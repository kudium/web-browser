import { aiDrawingPath, interpolateAIPath } from '../browser/aiDrawing';

it('preserves straight-drag endpoints and complete multi-point paths', () => {
  expect(aiDrawingPath({ x: 1, y: 2, toX: 3, toY: 4 })).toEqual([
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);
  const path = [
    { x: 1.25, y: 2.5 },
    { x: 12, y: 2.5 },
    { x: 12, y: 18 },
    { x: 1.25, y: 2.5 },
  ];
  const parsed = aiDrawingPath({ path });
  expect(parsed).toEqual(path);
  expect(parsed[0]).not.toBe(path[0]);
  const motions = interpolateAIPath(parsed);
  expect(motions.length).toBeLessThanOrEqual(36);
  path.slice(1).forEach((vertex) => expect(motions).toContainEqual(vertex));
  expect(motions.at(-1)).toEqual(path[3]);
  expect(motions[0].y).toBe(2.5);
});
it('rejects malformed, oversized and mixed drawing formats', () => {
  [
    {},
    { path: [] },
    { path: [{ x: 0, y: 0 }] },
    { path: Array.from({ length: 129 }, () => ({ x: 0, y: 0 })) },
    { path: [null, { x: 0, y: 0 }] },
    {
      path: [
        { x: '1', y: 0 },
        { x: 0, y: 0 },
      ],
    },
    {
      path: [
        { x: 0, y: Infinity },
        { x: 0, y: 0 },
      ],
    },
    {
      path: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
      ],
    },
    {
      path: [
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0 },
      ],
    },
    {
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      x: 0,
    },
    { x: 0, y: 0, toX: 1, toY: NaN },
  ].forEach((args) => expect(() => aiDrawingPath(args)).toThrow());
});
it('bounds interpolation while keeping every vertex in a long path', () => {
  const path = aiDrawingPath({
    path: Array.from({ length: 128 }, (_, i) => ({
      x: i % 2 ? 150 : 10,
      y: i / 2,
    })),
  });
  const motions = interpolateAIPath(path);
  expect(motions.length).toBeLessThanOrEqual(1024);
  path.slice(1).forEach((vertex) => expect(motions).toContainEqual(vertex));
});

it('avoids redundant movements for a densely sampled curve without dropping vertices', () => {
  const path = Array.from({ length: 128 }, (_, index) => ({
    x: 35 + (105 * index) / 127,
    y: 24 + 51 * Math.sin((Math.PI * index) / 254),
  }));
  expect(interpolateAIPath(path)).toEqual(path.slice(1));
  expect(
    interpolateAIPath([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
  ).toHaveLength(12);
});
