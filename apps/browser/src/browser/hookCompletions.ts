/* CodeMirror snippets use literal ${...} placeholders; ancestor scans skip non-object nodes. */
/* eslint-disable no-template-curly-in-string, no-continue */
import {
  Completion,
  CompletionContext,
  CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

const activity =
  'create({\n  title: "${Something changed}",\n  message: "${What changed}",\n  url: context.url\n})';
const note =
  'create({\n  title: "${Page note}",\n  body: "${Markdown content}"\n})';
const members: Record<string, Completion[]> = {
  context: [
    {label:'theme',type:'namespace',info:'Read-only resolved browser colors: primary, frame and contrast.'},
    {label:'panel',type:'namespace',info:'Render structured output or sandboxed HTML in the shared sidebar Panels page.'},
    {
      label: 'signal',
      type: 'property',
      detail: 'AbortSignal',
      info: 'Aborted when this hook stops.',
    },
    {
      label: 'runId',
      type: 'property',
      detail: 'string',
      info: 'Identity of this hook stage execution.',
    },
    snippetCompletion('onCleanup(() => {\n  ${cleanup}\n})', {
      label: 'onCleanup',
      type: 'function',
      info: 'Clean up DOM changes and disconnect observers when the hook stops.',
    }),
    snippetCompletion('setInterval(() => {\n  ${callback}\n}, ${1000})', {
      label: 'setInterval',
      type: 'function',
      info: 'A repeating timer owned by this hook.',
    }),
    snippetCompletion('setTimeout(() => {\n  ${callback}\n}, ${1000})', {
      label: 'setTimeout',
      type: 'function',
      info: 'A timer owned by this hook.',
    }),
    snippetCompletion(
      'listen(document, "${click}", (event) => {\n  ${callback}\n})',
      {
        label: 'listen',
        type: 'function',
        info: 'Register a listener removed automatically when the hook stops.',
      }
    ),
    {
      label: 'activity',
      type: 'namespace',
      info: 'Create an in-app Activity alert with context.activity.create({ title, message, url }).',
    },
    {
      label: 'notes',
      type: 'namespace',
      info: 'Save a Markdown note and create a linked Activity alert.',
    },
    {
      label: 'url',
      type: 'property',
      detail: 'string',
      info: 'The current page URL.',
    },
    {
      label: 'document',
      type: 'variable',
      detail: 'Document',
      info: 'The current page DOM.',
    },
    {
      label: 'content',
      type: 'property',
      detail: 'string',
      info: 'The current page HTML.',
    },
    {
      label: 'page',
      type: 'namespace',
      info: 'Reload, stop, or navigate the page history.',
    },
    snippetCompletion('log(${message})', {
      label: 'log',
      type: 'function',
      detail: '(message)',
      info: 'Write to the hook log.',
    }),
    snippetCompletion('notify("${approvedKey}", "${message}")', {
      label: 'notify',
      type: 'function',
      detail: '(key, text)',
      info: 'Send to an approved notification binding. Configure the binding before using its key.',
    }),
  ],
  activity: [
    snippetCompletion(activity, {
      label: 'create',
      type: 'function',
      detail: '({ title, message?, url? }) → Promise',
      info: 'Creates an unread Activity alert. Use await to wait for saving. URL must be HTTP or HTTPS.',
    }),
  ],
  theme: [
    {label:'primary',type:'property',info:'The current browser primary color (hex).'},
    {label:'frame',type:'property',info:'The current browser frame color (hex).'},
    {label:'contrast',type:'property',info:'Readable text color for the primary background (hex).'},
  ],
  panel: [
    snippetCompletion('show({id:"${output}",title:"${Hook output}",content:{type:"markdown",text:"${# Results}"},reveal:true})',{label:'show',type:'function',info:'Create or replace an output panel. reveal is optional.'}),
    snippetCompletion('update({id:"${output}",title:"${Hook output}",content:{type:"json",value:${data}}})',{label:'update',type:'function',info:'Update a panel by id without rerunning the hook.'}),
    snippetCompletion('onAction("${refresh}",async payload=>{\n  ${handler}\n})',{label:'onAction',type:'function',info:'Register a handler for a declared panel action in this hook run.'}),
    snippetCompletion('close("${output}")',{label:'close',type:'function',info:'Remove this hook’s panel by id.'}),
  ],
  notes: [
    snippetCompletion(note, {
      label: 'create',
      type: 'function',
      detail: '({ title, body }) → Promise',
      info: 'Saves a Markdown note and creates an unread Activity linked to it. Use await to wait for saving.',
    }),
  ],
  page: ['reload', 'back', 'forward', 'stop'].map((label) =>
    snippetCompletion(`${label}()`, { label, type: 'function', detail: '()' })
  ),
  document: [
    snippetCompletion('querySelector("${selector}")', {
      label: 'querySelector',
      type: 'function',
      detail: '(selector) → Element | null',
    }),
    snippetCompletion('querySelectorAll("${selector}")', {
      label: 'querySelectorAll',
      type: 'function',
      detail: '(selector) → NodeList',
    }),
    snippetCompletion('getElementById("${id}")', {
      label: 'getElementById',
      type: 'function',
      detail: '(id) → Element | null',
    }),
    { label: 'title', type: 'property', detail: 'string' },
    { label: 'body', type: 'property', detail: 'HTMLElement' },
  ],
};
const fields: Record<string, Completion[]> = {
  activity: [
    snippetCompletion('title: "${Alert title}"', {
      label: 'title',
      type: 'property',
      detail: 'required string',
      info: 'A short title, up to 120 characters.',
    }),
    snippetCompletion('message: "${What changed}"', {
      label: 'message',
      type: 'property',
      detail: 'optional string',
      info: 'Details, up to 2,000 characters.',
    }),
    {
      label: 'url',
      type: 'property',
      apply: 'url: context.url',
      detail: 'optional HTTP(S) URL',
      info: 'Open this page when the Activity is clicked.',
    },
  ],
  notes: [
    snippetCompletion('title: "${Note title}"', {
      label: 'title',
      type: 'property',
      detail: 'required string',
    }),
    snippetCompletion('body: "${Markdown content}"', {
      label: 'body',
      type: 'property',
      detail: 'Markdown string',
    }),
  ],
};
const root = [
  ...members.context.map((item) => ({ ...item, boost: 5 })),
  {
    label: 'context',
    type: 'variable',
    boost: 10,
    info: 'Kudium hook API: activity, notes, page controls, DOM, logging and approved notifications.',
  },
  snippetCompletion(`await context.activity.${activity};`, {
    label: 'activity alert',
    type: 'function',
    detail: 'Create an Activity',
    boost: 10,
  }),
  snippetCompletion(`await context.notes.${note};`, {
    label: 'save note',
    type: 'function',
    detail: 'Save a note with an Activity link',
    boost: 10,
  }),
];

/** Adds hook API knowledge alongside standard JavaScript and local variables. */
export function hookCompletions(
  context: CompletionContext
): CompletionResult | null {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  for (let current = node; current; current = current.parent!) {
    if (
      /^(String|TemplateString|RegExp|LineComment|BlockComment)$/.test(
        current.name
      )
    )
      return null;
  }
  const prefix = context.state.sliceDoc(0, context.pos);
  const match = /(?:([\w$]+(?:\.[\w$]+)*)\.)?([\w$]*)$/.exec(prefix);
  if (!match) return null;
  const from = context.pos - match[2].length;
  if (match[1]) {
    const owner = match[1].replace(/^context\./, '');
    return members[owner]
      ? { from, options: members[owner], validFor: /^[\w$]*$/ }
      : null;
  }
  for (let current = node; current; current = current.parent!) {
    if (current.name !== 'ObjectExpression') continue;
    const call =
      current.parent?.name === 'ArgList' ? current.parent.parent : null;
    if (call?.name !== 'CallExpression' || !call.firstChild) break;
    const method = context.state
      .sliceDoc(call.firstChild.from, call.firstChild.to)
      .replace(/\s/g, '');
    const kind = /^(?:context\.)?(activity|notes)\.create$/.exec(method)?.[1];
    if (
      kind &&
      /(?:^\{\s*|,\s*)$/.test(context.state.sliceDoc(current.from, from))
    )
      return { from, options: fields[kind], validFor: /^[\w$]*$/ };
    break;
  }
  return context.explicit || match[2]
    ? { from, options: root, validFor: /^[\w$]*$/ }
    : null;
}
