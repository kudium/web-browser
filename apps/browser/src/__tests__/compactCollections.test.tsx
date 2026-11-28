import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { CollectionIcon } from '../components/UI/CollectionIcon';
import { ChromeIconButton } from '../components/UI/ChromeIconButton';
import { Plus } from 'lucide-react';

// Execute Main's actual collection and creation controls without unrelated IPC.
const source = fs.readFileSync(
  path.join(__dirname, '../components/View/Main/Main.tsx'),
  'utf8',
);
const tree = ts.createSourceFile(
  'Main.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const elements = new Map<string, ts.JsxElement>();
function visit(node: ts.Node) {
  if (ts.isJsxElement(node)) {
    for (const attribute of node.openingElement.attributes.properties)
      if (
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(tree) === 'className' &&
        attribute.initializer &&
        ts.isStringLiteral(attribute.initializer)
      )
        if (
          [
            'folder-heading',
            'folder-content',
            'sidebar-create-actions',
          ].includes(attribute.initializer.text)
        )
          elements.set(attribute.initializer.text, node);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
function fixture() {
  const preview = { target: null as any, open: jest.fn(), close: jest.fn() };
  preview.open.mockImplementation((target) => {
    preview.target = target;
  });
  preview.close.mockImplementation(() => {
    preview.target = null;
  });
  const collapse = jest.fn(),
    create = jest.fn(),
    menu = jest.fn().mockResolvedValue('folder');
  const context = vm.createContext({
    React,
    CollectionIcon,
    ChromeIconButton,
    Plus,
    compact: true,
    folder: { id: 'docs', name: 'Documents' },
    filteringGroups: false,
    collapsedFolders: [],
    focusedCollectionId: 'docs',
    preview,
    setCollapsedFolders: collapse,
    folderHoverPreviews: false,
    previewIndex: { folders: new Map() },
    active: { id: 'default', name: 'Personal' },
    filteredGroups: [
      { id: 'one', folderId: 'docs' },
      { id: 'two', folderId: 'docs' },
    ],
    renderApp: (item: any) => <button key={item.id}>{item.id}</button>,
    closePreview: preview.close,
    browser: { nativeMenu: menu },
    applySpaceMenuChoice: create,
    setMoveMessage: jest.fn(),
  });
  vm.runInContext(
    ts.transpileModule(
      `function CollectionRow(){return <div className="tab-folder">${elements.get('folder-heading')!.getText(tree)}${elements.get('folder-content')!.getText(tree)}</div>}; function Create(){return ${elements.get('sidebar-create-actions')!.getText(tree)}}`,
      {
        compilerOptions: {
          jsx: ts.JsxEmit.React,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return {
    context,
    preview,
    collapse,
    create,
    menu,
    row: () => vm.runInContext('React.createElement(CollectionRow)', context),
    add: () => vm.runInContext('React.createElement(Create)', context),
  };
}
it('uses a collection popup in compact mode without rendering nested groups or changing the saved expanded state', () => {
  const fixtureView = fixture();
  const { context, preview, collapse, row } = fixtureView;
  const view = render(row());
  const trigger = screen.getByRole('button', { name: 'Documents' });
  expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  expect(trigger).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByText('one')).not.toBeInTheDocument();
  expect(view.container.querySelector('.folder-content')).toHaveAttribute(
    'inert',
  );
  fireEvent.click(trigger);
  view.rerender(row());
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(preview.open).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'folder',
      id: 'docs',
      interaction: 'click',
    }),
  );
  expect(collapse).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: 'ArrowRight' });
  expect(preview.open).toHaveBeenLastCalledWith(
    expect.objectContaining({ interaction: 'keyboard' }),
  );
  expect(collapse).not.toHaveBeenCalled();
  context.compact = false;
  view.rerender(row());
  expect(screen.getByText('one')).toBeInTheDocument();
  expect(screen.getByText('two')).toBeInTheDocument();
  expect(view.container.querySelector('.folder-content')).not.toHaveAttribute(
    'inert',
  );
  fireEvent.click(trigger);
  expect(collapse).toHaveBeenCalled();
});
it('keeps creation to one compact button and runs an existing action only after menu selection', async () => {
  const { add, menu, create } = fixture();
  render(add());
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(menu).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to Personal' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith('folder'));
  expect(menu).toHaveBeenCalledWith([
    { id: 'new-tab', label: 'New tab…' },
    { id: 'new-group', label: 'New group…' },
    { id: 'folder', label: 'New collection…' },
  ]);
});
