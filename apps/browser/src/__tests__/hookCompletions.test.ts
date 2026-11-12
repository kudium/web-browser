import { EditorState, EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { CompletionContext } from '@codemirror/autocomplete';
import { hookCompletions } from '../browser/hookCompletions';

function complete(doc: string, explicit = false) {
  const state = EditorState.create({ doc, extensions: [javascript()] });
  return hookCompletions(new CompletionContext(state, doc.length, explicit));
}
const labels = (doc: string) =>
  complete(doc)?.options.map((option) => option.label);

test('recognizes the context namespace, nested APIs and destructured aliases', () => {
  expect(labels('context.')).toEqual(
    expect.arrayContaining(['activity', 'notes', 'url', 'page', 'notify'])
  );
  expect(labels('await context.activity.')).toEqual(['create']);
  expect(labels('await notes.')).toEqual(['create']);
  expect(labels('context.page.')).toEqual([
    'reload',
    'back',
    'forward',
    'stop',
  ]);
  expect(complete('await context.activity.cre')?.from).toBe(
    'await context.activity.'.length
  );
  expect(complete('unrelated.')).toBeNull();
});

test('offers the correct object fields for activity and note creation', () => {
  expect(labels('await context.activity.create({\n  ')).toEqual([
    'title',
    'message',
    'url',
  ]);
  expect(labels('await notes.create({ title: "Saved",\n  bo')).toEqual([
    'title',
    'body',
  ]);
  expect(labels('await context.activity.create({ title: vari')).not.toContain(
    'title'
  );
});

test.each([
  '// context.activity.',
  '/* context.notes.',
  '"context.activity.',
  '`context.activity.',
])('does not suggest APIs inside comments or strings: %s', (doc) => {
  expect(complete(doc)).toBeNull();
});

test('inserts a usable awaited Activity snippet with editable fields', () => {
  const doc = 'activity';
  const result = complete(doc)!;
  const completion = result.options.find(
    (option) => option.label === 'activity alert'
  )!;
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [javascript()] }),
    parent: document.body,
  });
  try {
    if (typeof completion.apply !== 'function')
      throw new Error('Expected an editable snippet');
    completion.apply(view, completion, result.from, doc.length);
    expect(view.state.doc.toString()).toContain(
      'await context.activity.create({'
    );
    expect(view.state.doc.toString()).toContain('url: context.url');
    expect(view.state.selection.main.empty).toBe(false);
  } finally {
    view.destroy();
  }
});
