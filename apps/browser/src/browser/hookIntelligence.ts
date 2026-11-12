import { Completion, CompletionContext } from '@codemirror/autocomplete';
import { hoverTooltip } from '@codemirror/view';
import { linter } from '@codemirror/lint';
import { localCompletionSource, snippets } from '@codemirror/lang-javascript';
import { hookCompletions } from './hookCompletions';

export async function intelligentHookCompletions(context: CompletionContext) {
  const hook = hookCompletions(context);
  const local = localCompletionSource(context);
  const token = context.matchBefore(/[\w$]*/);
  if (
    !context.explicit &&
    !token?.text &&
    context.state.sliceDoc(context.pos - 1, context.pos) !== '.'
  )
    return hook;
  let typed: Completion[] = [];
  let from = hook?.from ?? local?.from ?? token?.from ?? context.pos;
  try {
    if (window.electron?.siteDeveloper?.language) {
      const result = await window.electron.siteDeveloper.language({
        action: 'completions',
        source: context.state.doc.toString(),
        position: context.pos,
      });
      typed = result.completions || [];
      from = result.from ?? from;
    }
  } catch {
    /* Keep snippets and local completion when the language service is unavailable. */
  }
  const root = hook?.options.some((item) => item.label === 'context');
  const seen = new Set<string>();
  const options = [
    ...(hook?.options || []),
    ...(root ? snippets : []),
    ...typed,
    ...(local?.options || []),
  ].filter((item) => {
    if (seen.has(item.label)) return false;
    seen.add(item.label);
    return true;
  });
  return options.length ? { from, options, validFor: /^[\w$]*$/ } : null;
}
export const hookDiagnostics = linter(
  async (view) => {
    if (!window.electron?.siteDeveloper?.language) return [];
    const source = view.state.doc.toString();
    try {
      const result = await window.electron.siteDeveloper.language({
        action: 'diagnostics',
        source,
        position: 0,
      });
      return view.state.doc.toString() === source
        ? result.diagnostics || []
        : [];
    } catch {
      return [];
    }
  },
  { delay: 700 }
);
export const hookTypeInfo = hoverTooltip(async (view, position) => {
  if (!window.electron?.siteDeveloper?.language) return null;
  const source = view.state.doc.toString();
  try {
    const result = await window.electron.siteDeveloper.language({
      action: 'hover',
      source,
      position,
    });
    if (!result.hover || view.state.doc.toString() !== source) return null;
    const info = result.hover;
    return {
      pos: info.from,
      end: info.to,
      create: () => {
        const dom = document.createElement('pre');
        dom.className = 'hook-type-info';
        dom.textContent = info.text.trim();
        return { dom };
      },
    };
  } catch {
    return null;
  }
});
