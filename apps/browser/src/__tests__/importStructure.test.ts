import { parseBrowserLinks } from '../browser/browserImport';
import { buildImportedWorkspace } from '../browser/importWorkspace';

test('bookmark HTML preserves the folder ancestry instead of flattening', () => {
  const links = parseBrowserLinks(
    '<DL><DT><H3>Work</H3><DL><DT><H3>Research</H3><DL><DT><A HREF="https://example.com">Example</A></DL></DL></DL>',
    'html'
  );
  expect(links[0].folderPath).toEqual(['Work', 'Research']);
  const plan = buildImportedWorkspace(
    links,
    [{ id: 'personal', name: 'Personal', color: 'iris', folders: [] }],
    'personal',
    'Dia'
  );
  expect(plan.spaces[0].folders[0].name).toBe('Work / Research');
  expect(plan.apps[0].folderId).toBe(plan.spaces[0].folders[0].id);
});
test('Arc outline creates spaces, folders and favorites with fresh profiles', () => {
  const links = parseBrowserLinks(
    '# Arc Data Export\n## Work\n### Favorites\n- [Mail](https://mail.example)\n### Research\n- [Docs](https://docs.example)\n## Personal\n### Pinned tabs\n- [News](https://news.example)',
    'markdown'
  );
  const plan = buildImportedWorkspace(
    links,
    [{ id: 'existing', name: 'Existing', color: 'iris', folders: [] }],
    'existing',
    'Arc'
  );
  expect(plan.spaces.map((space) => space.name)).toEqual([
    'Existing',
    'Work',
    'Personal',
  ]);
  expect(plan.apps[0].favorite).toBe(true);
  expect(plan.apps[1].folderId).toBeTruthy();
  expect(plan.apps[1].spaceId).not.toBe(plan.apps[2].spaceId);
  expect(plan.apps[2].pinned).toBe(true);
});
