/* Optional props use parameter defaults. */
/* eslint-disable react/require-default-props */
import { useMemo, useEffect, useState } from 'react';
import CodeMirror, { EditorView, EditorState } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion } from '@codemirror/autocomplete';
import { css } from '@codemirror/lang-css';
import {
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
}: {
  value: string;
  onChange: (source: string) => void;
  language: 'javascript' | 'css';
  label: string;
  disabled: boolean;
  jumpLine?: { line: number; token: number };
}) {
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
        transaction.newDoc.length > 100000 ? [] : transaction
      ),
      EditorView.contentAttributes.of({ 'aria-label': label }),
    ],
    [language, label]
  );
  return (
    <CodeMirror
      className="site-hook-code"
      onCreateEditor={setView}
      value={value}
      onChange={(next) => {
        if (next.length <= 100000) onChange(next);
      }}
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
