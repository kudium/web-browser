import { createDummyData, seedDummyData } from '../development/dummyData';
import { prepareCollectionGroups } from '../utils/collectionGroups';

it('creates a deterministic, coherent real-site workspace with varied group scenarios', () => {
  const data = createDummyData();
  expect(data).toEqual(createDummyData());
  expect(new Set(data.apps.map((tab) => tab.id)).size).toBe(data.apps.length);
  expect(data.apps.length).toBeGreaterThan(50);
  expect(
    new Set(data.apps.filter((tab) => tab.favorite).map((tab) => tab.sessionId))
      .size
  ).toBe(5);
  expect(prepareCollectionGroups(data.apps, [])).toEqual(data.apps);
  data.apps.forEach((tab) => {
    expect(new URL(tab.url).protocol).toBe('https:');
    expect(data.spaces.some((item) => item.id === tab.spaceId)).toBe(true);
  });
  data.apps
    .filter((tab) => tab.folderId)
    .forEach((tab) => {
      const space = data.spaces.find((item) => item.id === tab.spaceId);
      expect(space?.folders.some((folder) => folder.id === tab.folderId)).toBe(
        true
      );
    });
  expect(data.apps.find((tab) => tab.id === data.selectedId)?.spaceId).toBe(
    data.activeSpace
  );
});

it('seeds once per launch and preserves edits during reloads', () => {
  localStorage.clear();
  sessionStorage.clear();
  seedDummyData('first');
  expect(JSON.parse(localStorage.getItem('user_apps') || '[]')).toHaveLength(
    createDummyData().apps.length
  );
  localStorage.setItem('user_apps', '[]');
  seedDummyData('first');
  expect(localStorage.getItem('user_apps')).toBe('[]');
  seedDummyData('second');
  expect(
    JSON.parse(localStorage.getItem('user_apps') || '[]').length
  ).toBeGreaterThan(50);
});
