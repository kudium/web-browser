import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { moveGroupToSection } from '../utils/tabMoves';
import { IApp } from '../types';

// Exercise Main's real drop handlers and target without mounting native views.
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
let handler: ts.VariableDeclaration;
let target: ts.JsxElement;
let heading: ts.JsxElement;
const visit = (node: ts.Node) => {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(tree) === 'sectionDropProps'
  )
    handler = node;
  if (
    ts.isJsxElement(node) &&
    node.openingElement.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.getText(tree) === 'className="favorites-grid"'
    )
  )
    target = node;
  if (
    ts.isJsxElement(node) &&
    node.openingElement.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.getText(tree) === 'className="space-heading"'
    )
  )
    heading = node;
  ts.forEachChild(node, visit);
};
visit(tree);

const tabs: IApp[] = [
  {
    id: 'one',
    sessionId: 'work',
    sessionName: 'Work',
    name: 'Docs',
    url: 'https://example.com',
    icon: '',
    spaceId: 'default',
  },
  {
    id: 'two',
    sessionId: 'work',
    name: 'Inbox',
    url: 'https://example.com/inbox',
    icon: '',
    spaceId: 'default',
  },
  {
    id: 'other',
    sessionId: 'personal',
    name: 'Personal',
    url: 'https://example.org',
    icon: '',
    spaceId: 'default',
  },
];
function fixture(favorites: IApp[] = []) {
  const set = jest.fn();
  const finishDrag = jest.fn();
  const setMoveMessage = jest.fn();
  const setDropTarget = jest.fn();
  const context = vm.createContext({
    React,
    Error,
    favorites,
    dragged: undefined,
    dropTarget: undefined,
    renderApp: (item: IApp) => <button key={item.id}>{item.name}</button>,
    active: { id: 'default' },
    AppManager: { getAll: () => tabs, set },
    moveGroupToSection,
    finishDrag,
    setMoveMessage,
    setDropTarget,
  });
  vm.runInContext(
    ts.transpileModule(
      `const ${handler.getText(
        tree
      )}; function Target() { return (<>${target.getText(
        tree
      )}${heading.openingElement.getText(
        tree
      )}<button>Space header</button></div></>); }`,
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
        },
      }
    ).outputText,
    context
  );
  const Target = vm.runInContext('Target', context);
  const view = render(<Target />);
  const start = (axis: 'vertical' | 'horizontal' = 'vertical') => {
    context.dragged = { id: 'one', axis };
    view.rerender(<Target />);
  };
  const dataTransfer = { getData: () => 'one', dropEffect: 'none' };
  return {
    set,
    finishDrag,
    setMoveMessage,
    setDropTarget,
    start,
    dataTransfer,
  };
}

it('keeps empty Favorites hidden without inserting a placeholder during dragging', () => {
  const { start } = fixture();
  expect(
    screen.queryByRole('navigation', { name: 'Favorite groups' })
  ).toBeNull();
  const header = screen.getByText('Space header');
  start();
  expect(
    screen.queryByRole('navigation', { name: 'Favorite groups' })
  ).toBeNull();
  expect(screen.getByText('Space header')).toBe(header);
  expect(screen.queryByText(/Drag groups|Drop to favorite/)).toBeNull();
});

it.each([{ favorites: [] }, { favorites: [tabs[2]] }])(
  'drops the whole group into Favorites with $favorites',
  ({ favorites }) => {
    const { start, dataTransfer, set, finishDrag, setDropTarget } =
      fixture(favorites);
    start();
    const area = screen.getByText('Space header');
    fireEvent.dragOver(area, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');
    expect(setDropTarget).toHaveBeenCalledWith('section-favorites');
    fireEvent.drop(area, { dataTransfer });
    const moved: IApp[] = set.mock.calls[0][0];
    expect(moved.slice(0, 2).every((tab) => tab.favorite && tab.pinned)).toBe(
      true
    );
    expect(moved.map((tab) => tab.sessionId)).toEqual(
      tabs.map((tab) => tab.sessionId)
    );
    expect(moved[2]).toBe(tabs[2]);
    expect(finishDrag).toHaveBeenCalled();
  }
);

it('reports a rejected drop and ends the drag', () => {
  const { start, dataTransfer, set, finishDrag, setMoveMessage } = fixture();
  set.mockImplementation(() => {
    throw new Error('Unlock this group before changing it.');
  });
  start();
  fireEvent.drop(screen.getByText('Space header'), {
    dataTransfer,
  });
  expect(setMoveMessage).toHaveBeenCalledWith(
    'Unlock this group before changing it.'
  );
  expect(finishDrag).toHaveBeenCalled();
});

it('still accepts drops directly into existing Favorites', () => {
  const { start, dataTransfer, set } = fixture([tabs[2]]);
  start();
  fireEvent.drop(screen.getByRole('navigation', { name: 'Favorite groups' }), {
    dataTransfer,
  });
  expect(set.mock.calls[0][0][0].favorite).toBe(true);
});

it('does not favorite a whole group when an individual tab crosses the header', () => {
  const { start, dataTransfer, set, setDropTarget } = fixture();
  start('horizontal');
  const header = screen.getByText('Space header');
  fireEvent.dragOver(header, { dataTransfer });
  fireEvent.drop(header, { dataTransfer });
  expect(setDropTarget).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
});
