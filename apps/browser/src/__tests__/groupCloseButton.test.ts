import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

it('unloads first, preserves cancellation, then archives with Undo after confirmation', async () => {
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
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === 'closeGroupButton'
    )
      declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const item = { id: 'one', sessionId: 'group', name: 'Work' };
  let tabs = [item];
  const closedGroups = new Set<string>();
  const confirm = jest.fn().mockResolvedValue(false);
  const nativeMenu = jest.fn().mockResolvedValue('archive');
  const removeGroup = jest.fn().mockResolvedValue({ removed: false });
  const removeDeleted = jest.fn();
  const set = jest.fn((next) => {
    tabs = next;
  });
  const undo = jest.fn();
  const context = vm.createContext({
    item,
    closedGroups,
    closeGroupConfirming: { current: new Set() },
    aiGroupId: () => 'group',
    selected: item,
    browser: { confirm, nativeMenu, removeGroup },
    AppManager: { getAll: () => tabs, set, removeDeleted },
    closeGroup: jest.fn(() => closedGroups.add('group')),
    setClosedGroupUndo: undo,
  });
  vm.runInContext(
    ts.transpileModule(`const ${declaration!.getText(tree)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context
  );
  await vm.runInContext('closeGroupButton(item)', context);
  expect(confirm).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  expect(undo).toHaveBeenCalled();
  await vm.runInContext('closeGroupButton(item)', context);
  expect(removeGroup).toHaveBeenCalledWith('one', true);
  expect(confirm).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  removeGroup.mockResolvedValue({ removed: false, archive: true } as any);
  await vm.runInContext('closeGroupButton(item)', context);
  expect(set).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'one', archived: true }),
  ]);
  expect(undo).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: 'group', ids: ['one'] })
  );
  removeGroup.mockResolvedValue({ removed: false });
  await vm.runInContext('closeGroupButton(item)', context);
  expect(removeGroup).toHaveBeenCalledWith('one', true);
  expect(removeDeleted).not.toHaveBeenCalled();
  removeGroup.mockResolvedValue({ removed: true, ids: ['one'] } as any);
  await vm.runInContext('closeGroupButton(item)', context);
  expect(removeDeleted).toHaveBeenCalledWith(['one']);
  expect(undo).toHaveBeenLastCalledWith(undefined);
});
