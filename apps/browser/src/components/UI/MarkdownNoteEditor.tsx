/* Optional refs and props have functional defaults. */
/* eslint-disable react/require-default-props */
import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

export type NoteFormat =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'list'
  | 'code'
  | 'inlineCode';
export type NoteEditorHandle = { format: (command: NoteFormat) => void };

// Mount per note: subsequent autosaves must not reset selection or undo history.
export const MarkdownNoteEditor = forwardRef<
  NoteEditorHandle,
  {
    markdown: string;
    onChange: (markdown: string) => void;
    onSelectionChange: (selected: boolean) => void;
  }
>(({ markdown, onChange, onSelectionChange }, ref) => {
  const editor = useEditor({
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown,
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Note content',
        'aria-multiline': 'true',
        class: 'ai-markdown notes-rich-editor',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
  });
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      !!current && !current.state.selection.empty,
  });
  useEffect(() => {
    onSelectionChange(!!selected);
  }, [selected, onSelectionChange]);
  useImperativeHandle(
    ref,
    () => ({
      format(command) {
        if (!editor) return;
        const chain = editor.chain().focus();
        switch (command) {
          case 'bold':
            chain.toggleBold().run();
            break;
          case 'italic':
            chain.toggleItalic().run();
            break;
          case 'heading':
            chain.toggleHeading({ level: 2 }).run();
            break;
          case 'list':
            chain.toggleBulletList().run();
            break;
          case 'inlineCode':
            chain.toggleCode().run();
            break;
          case 'code':
            chain.toggleCodeBlock().run();
            break;
          default:
            break;
        }
      },
    }),
    [editor]
  );
  return <EditorContent editor={editor} className="notes-rich-surface" />;
});
MarkdownNoteEditor.displayName = 'MarkdownNoteEditor';
