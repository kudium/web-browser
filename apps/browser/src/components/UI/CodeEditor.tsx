import { tabCompletion } from '../../utils/editorCompletion';
import { linter } from "@codemirror/lint";
import { hookSourceValidator } from "../../browser/hookValidation";
/* Optional props use parameter defaults. */
/* eslint-disable react/require-default-props */
import { useMemo, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import CodeMirror, { EditorView, EditorState } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion } from '@codemirror/autocomplete';
import { css } from '@codemirror/lang-css';
import {
  hookLanguageMode,
  intelligentHookCompletions,
  hookDiagnostics,
  hookTypeInfo,
} from '../../browser/hookIntelligence';
import { useAppearance } from '../../utils/appearance';

export function CodeEditor({
  value,
  onChange,
  language,
  label,
  disabled,
  jumpLine,
  maxLength = 100000,
  mode = 'lifecycle',
}: {
  value: string;
  onChange: (source: string) => void;
  language: 'javascript' | 'css';
  label: string;
  disabled: boolean;
  jumpLine?: { line: number; token: number };
  maxLength?: number;
  mode?: 'lifecycle' | 'action';
}) {
  const change = useRef(onChange);
  useLayoutEffect(() => { change.current = onChange; }, [onChange]);
  // Keep CodeMirror configuration stable as parent drafts/logs update.
  const edit = useCallback((next: string) => {
    if (next.length <= maxLength) change.current(next);
  }, [maxLength]);
  const [view, setView] = useState<EditorView>();
  useEffect(() => {
    if (!view || !jumpLine) return;
    const line = view.state.doc.line(
      Math.min(view.state.doc.lines, Math.max(1, jumpLine.line))
    );
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    view.focus();
  }, [view, jumpLine]);
  const { appearance } = useAppearance();
  const extensions = useMemo(
    () => [
      tabCompletion,
      hookLanguageMode.of(mode),
      linter(current => {
        const source = current.state.doc.toString();
        const errors = hookSourceValidator.errors({ before: language === 'javascript' && mode === 'lifecycle' ? source : '', after: '', css: language === 'css' ? source : '', ...(mode === 'action' ? { actions: [{ name: label, source }] } : {}) });
        return errors.map(error => {
          const line = current.state.doc.line(Math.min(error.line, current.state.doc.lines));
          const from = Math.min(line.to, line.from + error.column - 1);
          return { from, to: Math.min(current.state.doc.length, from + 1), severity: 'error' as const, message: error.message };
        });
      }, { delay: 400 }),
      language === 'css' ? css() : javascript(),
      ...(language === 'javascript'
        ? [
            autocompletion({ override: [intelligentHookCompletions] }),
            hookDiagnostics,
            hookTypeInfo,
          ]
        : []),
      EditorView.lineWrapping,
      EditorState.transactionFilter.of((transaction) =>
        transaction.newDoc.length > maxLength ? [] : transaction
      ),
      EditorView.contentAttributes.of({ 'aria-label': label }),
    ],
    [language, label, maxLength, mode]
  );
  return (
    <CodeMirror
      className="site-hook-code"
      onCreateEditor={setView}
      value={value}
      onChange={edit}
      extensions={extensions}
      theme={appearance}
      editable={!disabled}
      height="100%"
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
      }}
    />
  );
}
