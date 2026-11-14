import { linter, lintGutter } from "@codemirror/lint";
import { hookSourceValidator } from "../src/hook-validation";
import { formatHookSourceErrors } from "../../../packages/hooks/source-validation";
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { javascript, localCompletionSource } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { autocompletion, snippetCompletion, type CompletionContext } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const form = document.querySelector<HTMLFormElement>('[data-hook-publish]');
const nonce = document.querySelector<HTMLScriptElement>('[data-hook-editor-script]')?.nonce || '';
const views = new Map<HTMLTextAreaElement, EditorView>();
const button = (label: string, run: () => void) => {
  const template = document.querySelector<HTMLTemplateElement>('[data-hook-button-template]')!;
  const el = template.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
  el.type = 'button'; el.textContent = label; el.addEventListener('click', run);
  return el;
};
const lifecycleMembers = ['signal', 'runId', 'url', 'document', 'content', 'page', 'activity', 'notes', 'onCleanup', 'listen', 'setTimeout', 'setInterval', 'log'];
const actionMembers = ['url', 'title', 'selection', 'pageText', 'link', 'field', 'fields'];
const apiMembers = ['ai', 'notes', 'activity', 'passwords', 'input', 'showResult'];
function completions(mode: string) {
  return (context: CompletionContext) => {
    const nested = mode === 'action' ? context.matchBefore(/\bapi\.(ai|notes|activity|passwords|input)\.\w*/) : null;
    if (nested) {
      const namespace = nested.text.split('.')[1];
      const methods: Record<string, string[]> = { ai: ['compose'], notes: ['create'], activity: ['create'], passwords: ['generateAndFill'], input: ['request'] };
      return { from: nested.from + namespace.length + 5, options: methods[namespace].map(label => ({ label, type: 'function' })), validFor: /^\w*$/ };
    }
    const member = context.matchBefore(/\b(context|api)\.\w*/);
    if (member) {
      const root = member.text.split('.')[0];
      const names = root === 'api' ? (mode === 'action' ? apiMembers : []) : mode === 'action' ? actionMembers : lifecycleMembers;
      return { from: member.from + root.length + 1, options: names.map(label => ({ label, type: 'property' })), validFor: /^\w*$/ };
    }
    const local = localCompletionSource(context);
    const token = context.matchBefore(/\w*/);
    if (!context.explicit && !token?.text) return local;
    return { from: local?.from ?? token?.from ?? context.pos, options: [
      ...(local?.options || []), { label: 'context', type: 'variable', detail: 'Hook context' },
      ...(mode === 'action' ? [{ label: 'api', type: 'variable', detail: 'Action API' }] : [
        snippetCompletion('context.onCleanup(() => {\n  ${cleanup}\n});', { label: 'cleanup', type: 'function', detail: 'Clean up when the hook stops' }),
        snippetCompletion('const element = document.querySelector("${selector}");\nif (element) {\n  ${code}\n}', { label: 'query element', type: 'function' }),
      ]),
    ], validFor: /^\w*$/ };
  };
}
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: '#a13c9c' }, { tag: [tags.string, tags.regexp], color: '#a33b2b' },
  { tag: [tags.number, tags.bool, tags.null], color: '#2458a6' },
  { tag: tags.comment, color: '#737b85', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.propertyName], color: '#32695f' },
  { tag: [tags.typeName, tags.className], color: '#7956a5' },
]);
function mount(field: HTMLTextAreaElement) {
  if (views.has(field)) return;
  const mode = field.dataset.codeEditor!;
  const root = field.closest<HTMLElement>('.rt-TextAreaRoot')!;
  const host = document.createElement('div'); host.className = 'hook-code-editor';
  const toolbar = document.createElement('div'); toolbar.className = 'hook-code-toolbar';
  const language = document.createElement('span'); language.textContent = mode === 'css' ? 'CSS' : mode === 'action' ? 'JavaScript · Action handler' : 'JavaScript';
  const status = document.createElement('div'); status.className = 'hook-code-status';
  const label = mode === 'action' ? 'Action handler code' : `${field.name} code`;
  const limit = field.maxLength > 0 ? field.maxLength : 20000;
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: field.value, extensions: [
    basicSetup, lintGutter(), linter(current => {
      const source = current.state.doc.toString();
      const found = hookSourceValidator.errors({ before: mode === 'lifecycle' ? source : '', after: '', css: mode === 'css' ? source : '', ...(mode === 'action' ? { actions: [{ name: 'Handler', source }] } : {}) });
      return found.map(error => {
        const line = current.state.doc.line(Math.min(error.line, current.state.doc.lines));
        const from = Math.min(line.to, line.from + error.column - 1);
        return { from, to: Math.min(current.state.doc.length, from + 1), severity: 'error' as const, message: error.message };
      });
    }, { delay: 400 }), mode === 'css' ? css() : javascript(),
    ...(mode === 'css' ? [] : [autocompletion({ override: [completions(mode)] })]),
    syntaxHighlighting(colors), keymap.of([indentWithTab]), EditorView.lineWrapping,
    EditorView.cspNonce.of(nonce), EditorView.contentAttributes.of({ 'aria-label': label, 'aria-describedby': 'hook-code-help', spellcheck: 'false' }),
    EditorState.transactionFilter.of(tr => tr.newDoc.length > limit ? [] : tr),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        field.value = update.state.doc.toString();
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const line = update.state.doc.lineAt(update.state.selection.main.head);
      status.textContent = `Ln ${line.number}, Col ${update.state.selection.main.head - line.from + 1} · ${update.state.doc.length.toLocaleString()} / ${limit.toLocaleString()} characters`;
    }),
  ] }) });
  views.set(field, view);
  toolbar.append(language); host.prepend(toolbar); host.append(status);
  status.textContent = `Ln 1, Col 1 · ${field.value.length.toLocaleString()} / ${limit.toLocaleString()} characters`;
  root.hidden = true; root.after(host);
  field.addEventListener('hook-source-replaced', () => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: field.value } }));
  field.addEventListener('hook-editor-destroy', () => { view.destroy(); host.remove(); views.delete(field); });
  field.closest('details')?.addEventListener('toggle', () => view.requestMeasure());
}
if (form) {
  let changed = false;
  let publishing = false;
  const editStatus = document.createElement('span'); editStatus.className = 'hook-edit-status'; editStatus.setAttribute('role', 'status'); editStatus.textContent = 'Ready to edit';
  form.querySelector('.hook-publish-actions')!.prepend(editStatus);
  form.addEventListener('input', () => { changed = true; editStatus.textContent = 'Unsaved changes'; });
  form.addEventListener('submit', () => { publishing = true; });
  // Failed publishing restores the unload warning without blocking the success redirect.
  new MutationObserver(() => { if (!form.querySelector<HTMLButtonElement>('.hook-publish-actions button[type=submit]')!.disabled) publishing = false; }).observe(form.querySelector('.hook-publish-actions button[type=submit]')!, { attributes: true, attributeFilter: ['disabled'] });
  window.addEventListener('beforeunload', event => { if (changed && !publishing) { event.preventDefault(); event.returnValue = ''; } });
  const validation = document.createElement('div'); validation.className = 'hook-code-errors'; validation.setAttribute('role', 'alert'); validation.hidden = true;
  form.querySelector('.hook-publish-actions')!.before(validation);
  form.addEventListener('input', () => { validation.hidden = true; });
  form.addEventListener('submit', event => {
    const fields = Object.fromEntries(new FormData(form));
    const cards = [...form.querySelectorAll<HTMLElement>('[data-action-list] [data-hook-action]')];
    const diagnostics = hookSourceValidator.errors({ before: String(fields.before || ''), after: String(fields.after || ''), css: String(fields.css || ''), actions: cards.map(card => ({ id: card.querySelector<HTMLInputElement>('[data-action-id]')!.value, name: card.querySelector<HTMLInputElement>('[data-action-name]')!.value, source: card.querySelector<HTMLTextAreaElement>('[data-action-source]')!.value })) });
    validation.hidden = !diagnostics.length;
    if (!diagnostics.length) return;
    event.preventDefault(); event.stopImmediatePropagation(); publishing = false;
    validation.textContent = 'Fix these code errors before publishing:\n' + formatHookSourceErrors(diagnostics);
    const first = diagnostics[0];
    let field: HTMLTextAreaElement;
    if (first.stage === 'action') {
      const card = cards[first.actionIndex!]; (card as HTMLDetailsElement).open = true;
      field = card.querySelector('[data-action-source]')!;
    } else {
      const index = ['before', 'after', 'css'].indexOf(first.stage); select(index);
      field = form.querySelector(`[name=${first.stage}]`)!;
    }
    const view = views.get(field)!; const line = view.state.doc.line(Math.min(first.line, view.state.doc.lines));
    view.dispatch({ selection: { anchor: Math.min(line.to, line.from + first.column - 1) }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    view.focus(); validation.scrollIntoView({ block: 'nearest' });
  }, { capture: true });
  const stages = form.querySelector<HTMLElement>('[data-code-stages]')!;
  const panels = [...stages.querySelectorAll<HTMLDetailsElement>(':scope > details')];
  const names = ['Before load', 'After load', 'CSS'];
  const hints = [
    'Runs when the document is created. Async work does not pause website scripts.',
    'Runs after resources finish loading and on navigation within the page.',
    'Applied at document start and on route changes.',
  ];
  const tabs = document.createElement('div'); tabs.className = 'hook-stage-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Code stage');
  const hint = document.createElement('p'); hint.className = 'hook-stage-hint';
  const help = document.createElement('p'); help.id = 'hook-code-help'; help.className = 'hook-code-help'; help.textContent = 'Tab to indent · Esc then Tab to leave · ⌘/Ctrl+Space for suggestions · ⌘/Ctrl+F to find';
  function select(index: number, focus = false) {
    panels.forEach((panel, i) => { panel.hidden = i !== index; panel.open = true; });
    [...tabs.children].forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); (tab as HTMLElement).tabIndex = i === index ? 0 : -1; });
    hint.textContent = hints[index];
    if (focus) (tabs.children[index] as HTMLElement).focus();
    views.forEach(view => view.requestMeasure());
  }
  panels.forEach((panel, i) => {
    const tab = button(names[i], () => select(i)); tab.id = `hook-stage-tab-${i}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `hook-stage-panel-${i}`);
    panel.id = `hook-stage-panel-${i}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    panel.classList.add('hook-stage-panel'); tabs.append(tab);
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (i + 1) % 3 : event.key === 'ArrowLeft' ? (i + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
      if (next >= 0) { event.preventDefault(); select(next, true); }
    });
  });
  stages.querySelector('legend')!.after(tabs, hint); stages.append(help);
  form.querySelectorAll<HTMLTextAreaElement>('[data-code-editor]').forEach(mount);
  select(panels.findIndex(p => p.querySelector('textarea')!.value.trim()) < 0 ? 1 : panels.findIndex(p => p.querySelector('textarea')!.value.trim()));
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof HTMLElement) node.querySelectorAll<HTMLTextAreaElement>('[data-code-editor]').forEach(mount);
  }))).observe(form.querySelector('[data-action-list]')!, { childList: true });
  // Programmatic imports update all editors and select the first populated stage.
  panels.forEach(panel => panel.querySelector('textarea')!.addEventListener('hook-source-replaced', () => queueMicrotask(() => {
    const active = panels.findIndex(p => p.querySelector('textarea')!.value.trim()); select(active < 0 ? 1 : active);
  })));
}
