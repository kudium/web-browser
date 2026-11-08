import { loginProfileKey } from '../utils/groups';
import { importBrowsers, parseBrowserLinks } from '../browser/browserImport';
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
    'Dia',
    { foldersAsGroups: false, spacesAsFolders: false }
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
    'Arc',
    { foldersAsGroups: false, spacesAsFolders: false }
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

test.each(['Arc', 'Dia'])(
  '%s defaults to compact folders and tab groups',
  (source) => {
    const links = [
      {
        name: 'One',
        url: 'https://one.example',
        spaceName: 'Work',
        folderPath: ['Research'],
      },
      {
        name: 'Two',
        url: 'https://two.example',
        spaceName: 'Work',
        folderPath: ['Research'],
      },
      {
        name: 'Three',
        url: 'https://three.example',
        spaceName: 'Personal',
        folderPath: ['Research'],
      },
      {
        name: 'Four',
        url: 'https://four.example',
        spaceName: 'Work',
        folderPath: ['Other'],
      },
    ];
    const plan = buildImportedWorkspace(
      links,
      [{ id: 'target', name: 'Everyday', color: 'iris', folders: [] }],
      'target',
      source
    );
    expect(plan.spaces).toHaveLength(1);
    expect(plan.spaces[0].folders.map((folder) => folder.name)).toEqual([
      'Work',
      'Personal',
    ]);
    expect(plan.apps.every((app) => app.spaceId === 'target')).toBe(true);
    expect(plan.apps[0].sessionId).toBe(plan.apps[1].sessionId);
    expect(plan.apps[0].sessionId).not.toBe(plan.apps[2].sessionId);
    expect(plan.apps[0].sessionId).not.toBe(plan.apps[3].sessionId);
    expect(plan.apps[0].folderId).toBe(plan.apps[3].folderId);
    expect(plan.apps[0].sessionName).toBe('Research');
  }
);
test.each([
  [true, false, 2, []],
  [false, true, 1, ['Work / Research']],
  [false, false, 2, ['Research']],
] as const)(
  'applies organization options independently (%s, %s)',
  (foldersAsGroups, spacesAsFolders, count, folderNames) => {
    const plan = buildImportedWorkspace(
      [
        {
          name: 'Docs',
          url: 'https://docs.example',
          spaceName: 'Work',
          folderPath: ['Research'],
        },
      ],
      [{ id: 'target', name: 'Everyday', color: 'iris', folders: [] }],
      'target',
      'Arc',
      { foldersAsGroups, spacesAsFolders }
    );
    expect(plan.spaces).toHaveLength(count);
    expect(
      plan.spaces.flatMap((space) => space.folders.map((folder) => folder.name))
    ).toEqual(folderNames);
  }
);

test.each(importBrowsers)(
  '%s imports folders as tab groups by default and supports opting out',
  (source) => {
    const links = [
      {
        name: 'One',
        url: 'https://one.example',
        folderPath: ['Work', 'Research'],
      },
      {
        name: 'Two',
        url: 'https://two.example',
        folderPath: ['Work', 'Research'],
      },
      {
        name: 'Three',
        url: 'https://three.example',
        folderPath: ['Personal', 'Research'],
      },
    ];
    const existing = [
      { id: 'target', name: 'Everyday', color: 'iris' as const, folders: [] },
    ];
    const compact = buildImportedWorkspace(links, existing, 'target', source);
    expect(compact.spaces[0].folders).toEqual([]);
    expect(compact.apps[0].sessionId).toBe(compact.apps[1].sessionId);
    expect(compact.apps[0].sessionId).not.toBe(compact.apps[2].sessionId);
    expect(compact.apps[0].sessionName).toBe('Research');
    const original = buildImportedWorkspace(links, existing, 'target', source, {
      foldersAsGroups: false,
      spacesAsFolders: true,
    });
    expect(original.spaces[0].folders.map((folder) => folder.name)).toEqual([
      'Work / Research',
      'Personal / Research',
    ]);
  }
);

test('an import shares one login profile across groups and keeps separate imports isolated', () => {
  const links = [
    { name: 'One', url: 'https://one.example', folderPath: ['Work'] },
    { name: 'Two', url: 'https://two.example', folderPath: ['Personal'] },
  ];
  const spaces = [
    { id: 'target', name: 'Everyday', color: 'iris' as const, folders: [] },
  ];
  const first = buildImportedWorkspace(links, spaces, 'target', 'Chrome');
  const second = buildImportedWorkspace(links, spaces, 'target', 'Chrome');
  expect(first.apps[0].sessionId).not.toBe(first.apps[1].sessionId);
  expect(loginProfileKey(first.apps[0])).toBe(loginProfileKey(first.apps[1]));
  expect(loginProfileKey(first.apps[0])).not.toBe(
    loginProfileKey(second.apps[0])
  );
  const migration = buildImportedWorkspace(
    links,
    spaces,
    'target',
    'Arc',
    undefined,
    'cookie-transfer-profile'
  );
  expect(migration.apps.map(loginProfileKey)).toEqual([
    'cookie-transfer-profile',
    'cookie-transfer-profile',
  ]);
});
