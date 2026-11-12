/* Optional refs and props have functional defaults. */
/* eslint-disable react/require-default-props */
import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { browser } from '../../browser/client';
import { useAIPagePreference } from '../../utils/useAIPagePreference';
import { useAssistantPanelDocument } from './AssistantPanelContext';
import type { NativeMenuItem } from '../../browser/nativeUi';

const lowlight = createLowlight(common);

export type NoteFormat =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'list'
  | 'code'
  | 'inlineCode';
export type NoteEditorHandle = {
  format: (command: NoteFormat) => void;
  focusStart: () => void;
};

// Mount per note: subsequent autosaves must not reset selection or undo history.
export const MarkdownNoteEditor = forwardRef<
  NoteEditorHandle,
  {
    markdown: string;
    onChange: (markdown: string) => void;
    onSelectionChange: (selected: boolean) => void;
    onFocusTitle: () => void;
  }
>(({ markdown, onChange, onSelectionChange, onFocusTitle }, ref) => {
  const panelDocument = useAssistantPanelDocument();
  const [wrap, setWrap] = useAIPagePreference('noteWrap', true);
  const editor = useEditor({
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Markdown,
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      handleKeyDown: (view, event) => {
        if (
          event.key === 'ArrowUp' &&
          !event.isComposing &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          view.state.selection.empty &&
          view.state.selection.from === 1
        ) {
          event.preventDefault();
          onFocusTitle();
          return true;
        }
        return false;
      },
      attributes: {
        role: 'textbox',
        'aria-label': 'Note content',
        'aria-multiline': 'true',
        class: 'ai-markdown notes-rich-editor',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined;
    editor.view.updateRoot();
    // ProseMirror's selection observer stays on its original renderer document.
    const selectionChanged = () =>
      document.dispatchEvent(new Event('selectionchange'));
    if (panelDocument !== document)
      panelDocument.addEventListener('selectionchange', selectionChanged);
    return () =>
      panelDocument.removeEventListener('selectionchange', selectionChanged);
  }, [editor, panelDocument]);
  const showTextMenu = async () => {
    if (!editor || editor.isDestroyed) return;
    const { doc, selection } = editor.state;
    const hasSelection = !selection.empty;
    const mark = (
      id: string,
      label: string,
      active: string
    ): NativeMenuItem => ({
      id,
      label,
      type: 'checkbox',
      checked: editor.isActive(active),
      enabled: hasSelection,
    });
    const items: NativeMenuItem[] = [
      { id: 'wrap', label: 'Wrap text', type: 'checkbox', checked: wrap },
      { type: 'separator' },
      { id: 'undo', label: 'Undo', enabled: editor.can().undo() },
      { id: 'redo', label: 'Redo', enabled: editor.can().redo() },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: hasSelection },
      { label: 'Copy', role: 'copy', enabled: hasSelection },
      { label: 'Paste', role: 'paste' },
      { label: 'Paste and Match Style', role: 'pasteAndMatchStyle' },
      { label: 'Select All', role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Format',
        submenu: [
          mark('bold', 'Bold', 'bold'),
          mark('italic', 'Italic', 'italic'),
          mark('underline', 'Underline', 'underline'),
          mark('strike', 'Strikethrough', 'strike'),
          mark('inlineCode', 'Inline Code', 'code'),
          { id: 'clear', label: 'Remove Formatting', enabled: hasSelection },
          { type: 'separator' },
          { id: 'heading', label: 'Heading' },
          { id: 'paragraph', label: 'Body' },
          { id: 'list', label: 'Bulleted List' },
          { id: 'orderedList', label: 'Numbered List' },
          { id: 'code', label: 'Code Block' },
        ],
      },
    ];
    editor.view.focus();
    const action = await browser.nativeMenu(items);
    if (action === 'wrap') {
      setWrap(!wrap);
      return;
    }
    if (!action || editor.isDestroyed || !editor.state.doc.eq(doc)) return;
    const chain = editor
      .chain()
      .setTextSelection({ from: selection.from, to: selection.to })
      .focus();
    switch (action) {
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'inlineCode':
        chain.toggleCode().run();
        break;
      case 'clear':
        chain.unsetAllMarks().run();
        break;
      case 'heading':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'paragraph':
        chain.setParagraph().run();
        break;
      case 'list':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'code':
        chain.toggleCodeBlock().run();
        break;
      default:
        break;
    }
  };
  const empty = useEditorState({
    editor,
    selector: ({ editor: current }) => !!current?.isEmpty,
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
      focusStart() {
        editor?.commands.focus('start');
      },
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
  return (
    <EditorContent
      editor={editor}
      className="notes-rich-surface"
      data-empty={empty}
      data-wrap={wrap}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        showTextMenu().catch(() => {});
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          event.stopPropagation();
          showTextMenu().catch(() => {});
        }
      }}
    />
  );
});
MarkdownNoteEditor.displayName = 'MarkdownNoteEditor';
