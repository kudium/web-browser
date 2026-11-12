import {
  SpaceManager,
  spaceFrameColor,
  spacePrimaryColor,
  SPACE_KEY,
} from '../utils/SpaceManager';

jest.mock('../utils/EventBus', () => ({ eventBus: { dispatch: jest.fn() } }));

const space = {
  id: 'colors',
  name: 'Work',
  color: 'iris' as const,
  folders: [],
};

afterEach(() => localStorage.removeItem(SPACE_KEY));

test('existing spaces link their frame to the primary, including custom colors', () => {
  expect(spaceFrameColor(space)).toBe('#5aaca8');
  expect(spaceFrameColor({ ...space, customColor: '#345678' })).toBe('#345678');
});

test('independent frame tint survives saving and changing the primary', () => {
  SpaceManager.set([
    { ...space, customColor: '#345678', frameColor: '#123456' },
  ]);
  SpaceManager.update(space.id, { customColor: '#abcdef' });
  const saved = SpaceManager.getAll().find((entry) => entry.id === space.id)!;
  expect(spacePrimaryColor(saved)).toBe('#abcdef');
  expect(spaceFrameColor(saved)).toBe('#123456');
  SpaceManager.update(space.id, { frameColor: undefined });
  expect(
    spaceFrameColor(
      SpaceManager.getAll().find((entry) => entry.id === space.id)!
    )
  ).toBe('#abcdef');
});
