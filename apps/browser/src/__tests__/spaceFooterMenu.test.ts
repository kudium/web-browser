import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { spaceFooterMenu } from '../browser/spaceFooterMenu';
import { parseNativeMenu } from '../main/nativeMenu';

const spaces = [
  { id: 'personal', name: 'Personal' },
  { id: 'work', name: 'Work' },
];

it('offers custom spaces, system spaces, and relevant footer actions in a valid native menu', () => {
  const menu = parseNativeMenu(spaceFooterMenu(spaces, 'work', false));
  expect(menu.find((item) => item.label === 'Spaces')?.submenu).toEqual([
    { id: 'space:personal', label: 'Personal', enabled: true },
    { id: 'space:work', label: 'Work (Current)', enabled: true },
  ]);
  expect(
    menu
      .find((item) => item.label === 'System Spaces')
      ?.submenu?.map((item) => item.label)
  ).toEqual(['Downloads', 'History', 'Archive']);
  expect(menu.some((item) => item.label === 'Inspect')).toBe(false);
  expect(menu.some((item) => item.id === 'manage')).toBe(true);
});

it.each([
  'space:work',
  'system:downloads',
  'system:history',
  'system:archive',
  'rename',
])('routes %s from the footer to its intended destination', async (choice) => {
  const source = fs.readFileSync(
    path.join(__dirname, '../components/View/Main/Main.tsx'),
    'utf8'
  );
  const tree = ts.createSourceFile(
    'Main.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let declaration: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === 'showFooterMenu'
    )
      declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  expect(declaration).toBeDefined();
  const activate = jest.fn();
  const preferences = jest.fn();
  const apply = jest.fn();
  const context = vm.createContext({
    spaces,
    active: spaces[0],
    sidebarPage: 'personal',
    compact: false,
    browser: { nativeMenu: jest.fn().mockResolvedValue(choice), preferences },
    spaceFooterMenu,
    activateSidebarPage: activate,
    applySpaceMenuChoice: apply,
    DOWNLOADS_PAGE: 'downloads-page',
    HISTORY_PAGE: 'history-page',
    ARCHIVE_PAGE: 'archive-page',
    setCompact: jest.fn(),
    setSidebarHidden: jest.fn(),
  });
  const code = ts.transpileModule(
    `const ${declaration!.getText(tree)}; showFooterMenu('work');`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  await vm.runInContext(code, context);
  if (choice === 'system:archive') {
    expect(activate).toHaveBeenCalledWith('archive-page');
    expect(preferences).not.toHaveBeenCalled();
  } else if (choice === 'rename')
    expect(apply).toHaveBeenCalledWith('rename', spaces[1]);
  else
    expect(activate).toHaveBeenCalledWith(
      choice === 'space:work'
        ? 'work'
        : choice === 'system:downloads'
        ? 'downloads-page'
        : 'history-page'
    );
});
