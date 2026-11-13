import { act, renderHook } from '@testing-library/react';
import {
  SpaceManager,
  spaceFrameColor,
  spacePrimaryColor,
  SPACE_KEY,
  useSpaces,
} from '../utils/SpaceManager';

jest.mock('../utils/EventBus', () => ({
  eventBus: { dispatch: jest.fn(), on: jest.fn(() => () => {}) },
}));

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

test('refreshes space colors when another window saves them', () => {
  SpaceManager.set([{ ...space, id: 'default', customColor: '#345678' }]);
  const { result, unmount } = renderHook(useSpaces);
  expect(spacePrimaryColor(result.current.active)).toBe('#345678');
  act(() => {
    SpaceManager.set([{ ...space, id: 'default', customColor: '#abcdef' }]);
    window.dispatchEvent(new StorageEvent('storage', { key: SPACE_KEY }));
  });
  expect(spacePrimaryColor(result.current.active)).toBe('#abcdef');
  unmount();
});

test('website colors override the space only when enabled and valid', () => {
  const saved = {
    ...space,
    customColor: '#345678',
    frameColor: '#123456',
    useWebsiteColors: true,
  };
  expect(spacePrimaryColor(saved, '#4285f4')).toBe('#4285f4');
  expect(spaceFrameColor(saved, '#4285f4')).toBe('#123456');
  expect(spaceFrameColor({ ...saved, frameColor: undefined }, '#4285f4')).toBe(
    '#4285f4'
  );
  expect(spacePrimaryColor(saved)).toBe('#345678');
  expect(spaceFrameColor(saved, 'invalid')).toBe('#123456');
  expect(
    spaceFrameColor({ ...saved, useWebsiteColors: false }, '#4285f4')
  ).toBe('#123456');
  SpaceManager.set([saved]);
  expect(
    SpaceManager.getAll().find((entry) => entry.id === space.id)
      ?.useWebsiteColors
  ).toBe(true);
  SpaceManager.update(space.id, { useWebsiteColors: false });
  expect(
    SpaceManager.getAll().find((entry) => entry.id === space.id)
      ?.useWebsiteColors
  ).toBe(false);
});
