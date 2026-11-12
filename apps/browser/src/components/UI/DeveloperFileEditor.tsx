import { useMemo, useRef } from 'react';
import CodeMirror, {
  EditorView,
  ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import {
  undo,
  redo,
  undoDepth,
  redoDepth,
  selectAll,
  toggleComment,
  indentSelection,
} from '@codemirror/commands';
import { openSearchPanel, gotoLine } from '@codemirror/search';
import {
  showDeveloperContextMenu,
  menuSeparator,
  DeveloperMenuItem,
} from './developerContextMenu';
import { useAppearance } from '../../utils/appearance';

export function developerFileLanguage(name: string) {
  const language = [];
  if (/\.(html?|xhtml)$/i.test(name)) language.push(html());
  else if (/\.(css|scss)$/i.test(name)) language.push(css());
  else if (/\.(js|jsx|ts|tsx|mjs|cjs|json)$/i.test(name))
    language.push(
      javascript({
        typescript: /\.tsx?$/i.test(name),
        jsx: /\.[jt]sx$/i.test(name),
      })
    );
  return language;
}

export function DeveloperFileEditor({
  name,
  value,
  onChange,
  disabled,
  actions,
  onError,
  wrap,
  toggleWrap,
}: {
  wrap: boolean;
  toggleWrap: () => void;
  name: string;
  value: string;
  onChange: (source: string) => void;
  disabled: boolean;
  actions: DeveloperMenuItem[];
  onError: (message: string) => void;
}) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const { appearance } = useAppearance();
  const extensions = useMemo(() => {
    return [
      ...developerFileLanguage(name),
      ...(wrap ? [EditorView.lineWrapping] : []),
      EditorView.contentAttributes.of({ 'aria-label': `Editor for ${name}` }),
    ];
  }, [name, wrap]);
  const menu = () => {
    const view = editor.current?.view;
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const { state } = view;
    const active = () => editor.current?.view === view;
    const run = (command: (target: EditorView) => boolean) => () => {
      view.focus();
      command(view);
    };
    showDeveloperContextMenu(
      [
        { label: disabled ? 'File preview' : 'Code editor', disabled: true },
        {
          label: 'Undo',
          disabled: disabled || !undoDepth(view.state),
          run: run(undo),
        },
        {
          label: 'Redo',
          disabled: disabled || !redoDepth(view.state),
          run: run(redo),
        },
        menuSeparator,
        {
          label: 'Cut',
          disabled: disabled || !selected,
          run: async () => {
            await navigator.clipboard.writeText(selected);
            if (active() && view.state === state) {
              view.dispatch(view.state.replaceSelection(''));
              view.focus();
            }
          },
        },
        {
          label: 'Copy',
          disabled: !selected,
          run: () => navigator.clipboard.writeText(selected),
        },
        {
          label: 'Paste',
          disabled,
          run: async () => {
            const text = await navigator.clipboard.readText();
            if (active() && !view.state.readOnly) {
              view.dispatch(view.state.replaceSelection(text));
              view.focus();
            }
          },
        },
        { label: 'Select all', run: run(selectAll) },
        {
          label: 'Copy entire file',
          run: () => navigator.clipboard.writeText(view.state.doc.toString()),
        },
        menuSeparator,
        {
          label: disabled ? 'Find…' : 'Find / Replace…',
          run: run(openSearchPanel),
        },
        {
          label: wrap ? 'Disable line wrapping' : 'Enable line wrapping',
          run: toggleWrap,
        },
        { label: 'Go to line…', run: run(gotoLine) },
        {
          label: 'Toggle comment',
          disabled:
            disabled ||
            !/\.(js|jsx|ts|tsx|mjs|cjs|css|scss|html?|xhtml)$/i.test(name),
          run: run(toggleComment),
        },
        { label: 'Indent selection', disabled, run: run(indentSelection) },
        menuSeparator,
        ...actions,
      ],
      active,
      onError
    );
  };
  return (
    <CodeMirror
      ref={editor}
      className="developer-code-editor"
      readOnly={disabled}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        menu();
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          event.stopPropagation();
          menu();
        }
      }}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={appearance}
      editable={!disabled}
      height="100%"
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
      }}
    />
  );
}
