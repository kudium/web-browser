import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

it('opens group creation from the space menu in the active space', async () => {
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
  let actionFunction: ts.VariableDeclaration | undefined;
  let createFunction: ts.VariableDeclaration | undefined;
  let menuFunction: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === 'showSpaceMenu'
    )
      menuFunction = node;
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === 'applySpaceMenuChoice'
    )
      actionFunction = node;
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === 'openNewGroup'
    )
      createFunction = node;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  expect(menuFunction).toBeDefined();
  const nativeMenu = jest.fn().mockResolvedValue('new-group');
  const setGroupDialog = jest.fn();
  const setPaletteOpen = jest.fn();
  const setEditingGroup = jest.fn();
  const context = vm.createContext({
    browser: { nativeMenu },
    active: { id: 'work' },
    spaces: [{ id: 'work' }],
    appList: [],
    showUnpinnedGroups: false,
    windowWorkspace: { state: () => undefined },
    setGroupDialog,
    searchingGroups: false,
    collapsedSpaces: [],
    setSpaceSearch: jest.fn(),
    setDroppedProject: jest.fn(),
    useCallback: (callback: unknown) => callback,
    setEditingGroup,
    crypto: { randomUUID: () => 'draft-id' },
    setPaletteOpen,
  });
  const code = ts.transpileModule(
    `const ${createFunction!.getText(tree)}; const ${actionFunction!.getText(
      tree
    )}; const ${menuFunction!.getText(tree)}; showSpaceMenu();`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  await vm.runInContext(code, context);
  expect(nativeMenu.mock.calls[0][0]).toContainEqual({
    id: 'new-group',
    label: 'Create Group…',
  });
  expect(setGroupDialog).toHaveBeenCalledWith(
    expect.objectContaining({
      creating: true,
      item: expect.objectContaining({
        spaceId: 'work',
        name: '',
        url: 'about:blank',
        pinned: true,
      }),
    })
  );
  expect(setPaletteOpen).not.toHaveBeenCalled();
});
