import { waitFor } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import {
  autocompletion,
  completionStatus,
  startCompletion,
} from '@codemirror/autocomplete';
import { tabCompletion } from '../utils/editorCompletion';

let view: EditorView;
beforeAll(() => {
  global.ResizeObserver = jest
    .fn()
    .mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
});
afterEach(() => view?.destroy());
const create = (doc: string, readOnly = false) => {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        keymap.of([indentWithTab]),
        tabCompletion,
        EditorState.readOnly.of(readOnly),
        autocompletion({
          override: [
            () => ({
              from: 0,
              options: [{ label: 'context', type: 'variable' }],
            }),
          ],
          activateOnTyping: false,
        }),
      ],
    }),
  });
};
const tab = (shiftKey = false) =>
  runScopeHandlers(
    view,
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey }),
    'editor'
  );

it('accepts the active suggestion with Tab rather than inserting indentation', async () => {
  create('con');
  startCompletion(view);
  await waitFor(() => expect(completionStatus(view.state)).toBe('active'));
  expect(tab()).toBe(true);
  expect(view.state.doc.toString()).toBe('context');
});
it('keeps indentation and Shift+Tab unindent when no suggestion is active', () => {
  create('value');
  tab();
  expect(view.state.doc.toString()).toBe('  value');
  tab(true);
  expect(view.state.doc.toString()).toBe('value');
});
it('does not change a read-only editor', () => {
  create('con', true);
  tab();
  expect(view.state.doc.toString()).toBe('con');
});
