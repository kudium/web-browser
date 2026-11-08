import { useMemo } from 'react';
import CodeMirror, { EditorView, EditorState } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { useAppearance } from '../../utils/appearance';

export function CodeEditor({
  value,
  onChange,
  language,
  label,
  disabled,
}: {
  value: string;
  onChange: (source: string) => void;
  language: 'javascript' | 'css';
  label: string;
  disabled: boolean;
}) {
  const { appearance } = useAppearance();
  const extensions = useMemo(
    () => [
      language === 'css' ? css() : javascript(),
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
