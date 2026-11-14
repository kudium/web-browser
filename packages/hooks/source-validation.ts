/** Parser-only validation: source is never evaluated or executed. */
export interface HookSources {
  name?: string;
  before: string;
  after: string;
  css: string;
  actions?: Array<{ id?: string; name: string; source: string }>;
}
export interface HookSourceError {
  stage: 'before' | 'after' | 'css' | 'action';
  actionId?: string;
  actionIndex?: number;
  label: string;
  line: number;
  column: number;
  message: string;
}
export function formatHookSourceErrors(errors: HookSourceError[]) {
  return errors.map(error => `${error.label}, line ${error.line}, column ${error.column}: ${error.message}`).join('\n');
}
export class HookSourceValidationError extends Error {
  constructor(public readonly diagnostics: HookSourceError[]) {
    super(`Fix these code errors before saving or publishing:\n${formatHookSourceErrors(diagnostics)}`);
    this.name = 'HookSourceValidationError';
  }
}
export function createHookSourceValidator(parsers: { javascript: (source: string) => unknown; css: (source: string) => unknown }) {
  function errors(sources: HookSources): HookSourceError[] {
    const result: HookSourceError[] = [];
    const check = (source: string, stage: HookSourceError['stage'], label: string, actionIndex?: number) => {
      if (!source.trim()) return;
      const prelude = stage === 'action'
        ? 'async function __hook(context, api) {\n"use strict";\n'
        : 'async function __hook(context) {\n"use strict"; const {url, document, content, page, log, notify, activity, notes, setInterval, setTimeout, onCleanup, signal, listen, runId} = context;\n';
      try {
        if (stage === 'css') parsers.css(source);
        else {
          const tree = parsers.javascript(prelude + source + '\n}') as { body?: Array<{ loc?: { start: { line: number; column: number } } }> };
          if (tree?.body && tree.body.length !== 1) throw Object.assign(new SyntaxError('Unexpected closing brace outside the hook body'), { loc: tree.body[1]?.loc?.start || { line: 3, column: 0 } });
        }
      } catch (caught) {
        const error = caught as { message?: string; reason?: string; line?: number; column?: number; loc?: { line: number; column: number } };
        const lines = source.split('\n');
        const rawLine = stage === 'css' ? error.line || 1 : (error.loc?.line || 3) - 2;
        const line = Math.max(1, Math.min(lines.length, rawLine));
        const column = rawLine > lines.length ? lines[line - 1].length + 1 : Math.max(1, stage === 'css' ? error.column || 1 : (error.loc?.column || 0) + 1);
        result.push({ stage, label: sources.name ? `${sources.name} · ${label}` : label, line, column,
          message: error.reason || (error.message || 'Invalid syntax').replace(/ \(\d+:\d+\)$/, ''),
          ...(actionIndex === undefined ? {} : { actionIndex, actionId: sources.actions?.[actionIndex].id }),
        });
      }
    };
    check(sources.before, 'before', 'Before load');
    check(sources.after, 'after', 'After load');
    check(sources.css, 'css', 'CSS');
    sources.actions?.forEach((action, index) => check(action.source, 'action', `Action “${action.name}”`, index));
    return result;
  }
  return { errors, assert(sources: HookSources) { const found = errors(sources); if (found.length) throw new HookSourceValidationError(found); } };
}
