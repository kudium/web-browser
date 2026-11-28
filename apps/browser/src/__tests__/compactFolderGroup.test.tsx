import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { GroupIcon } from '../components/UI/GroupIcon';
import { TabIcon } from '../components/UI/TabIcon';

// Exercise Main's actual row and click handlers, isolating unrelated shell IPC.
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
let declaration!: ts.VariableDeclaration;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'renderApp')
    declaration = node;
  ts.forEachChild(node, visit);
}
visit(tree);
const item = {
  id: 'one',
  sessionId: 'work',
  sessionName: 'Work',
  name: 'Docs',
  url: 'https://example.com',
  icon: '',
  groupDisplay: 'folder' as const,
  sessionChromeCollapsed: false,
};
const tabs = [
  item,
  { ...item, id: 'two', name: 'Inbox', url: 'https://example.org' },
];

it('keeps an expanded folder group in one compact stack, opens its shared preview, and restores inline tabs outside compact mode', () => {
  const passthrough = ({ children }: any) => <>{children}</>;
  const icon = () => null;
  const preview = {
    target: null as any,
    open: jest.fn(),
    close: jest.fn(),
    leave: jest.fn(),
  };
  preview.open.mockImplementation((target) => {
    preview.target = target;
  });
  preview.close.mockImplementation(() => {
    preview.target = null;
  });
  const set = jest.fn(),
    expand = jest.fn(),
    select = jest.fn();
  const context = vm.createContext({
    React,
    compact: true,
    GroupIcon,
    TabIcon,
    ContextMenu: { Root: passthrough, Trigger: passthrough },
    ChevronDown: icon,
    Terminal: icon,
    Plus: icon,
    X: icon,
    LockKeyhole: icon,
    sidebarLabel: (name: string) => name,
    groupKey: (tab: any) => tab.sessionId,
    aiGroupId: (tab: any) => tab.sessionId,
    lockedGroup: () => false,
    groupAccess: { protected: [] },
    appList: tabs,
    selected: item,
    focusedTab: item,
    expandedGroups: [],
    setExpandedGroups: expand,
    renameTarget: undefined,
    tabDisplayMode: 'horizontal-only',
    preview,
    tabsForPreview: () => tabs,
    closePreview: preview.close,
    AppManager: { getAll: () => tabs, set },
    selectGroup: select,
    itemFocusColor: () => undefined,
    focusColorStyle: () => ({}),
    dragged: undefined,
    menuOpen: false,
    dropTarget: undefined,
    closedGroups: new Set(),
    renderGroupMenu: jest.fn(),
    setMenuOpen: jest.fn(),
    endWindowDrag: jest.fn(),
  });
  vm.runInContext(
    ts.transpileModule(`const ${declaration.getText(tree)};`, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  const row = () => vm.runInContext('renderApp(appList[0])', context);
  const view = render(row());
  expect(view.container.querySelector('.compact-group-stack')).not.toBeNull();
  expect(view.container.querySelector('.sidebar-group-content')).toBeNull();
  const button = screen.getByRole('button', { name: 'Work' });
  fireEvent.click(button);
  view.rerender(row());
  expect(preview.open).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'session',
      id: 'one',
      interaction: 'click',
    }),
  );
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(button).not.toHaveAttribute('aria-controls');
  expect(set).not.toHaveBeenCalled();
  expect(expand).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(preview.close).toHaveBeenCalled();
  context.compact = false;
  view.rerender(row());
  expect(
    view.container.querySelector('.sidebar-group-content'),
  ).toHaveAttribute('data-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Work' }));
  expect(set).toHaveBeenCalled();
  expect(expand).toHaveBeenCalled();
});
