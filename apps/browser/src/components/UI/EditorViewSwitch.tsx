import { Button, DropdownMenu } from '@radix-ui/themes';
import { ChevronDown, Code2, FileText } from 'lucide-react';
import { PanelDropdownContent } from './PanelDialog';

export type EditorView = 'visual' | 'markdown';

export function EditorViewSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EditorView;
  onChange: (view: EditorView) => void;
}) {
  const Icon = value === 'markdown' ? Code2 : FileText;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button
          size="1"
          variant="ghost"
          color="gray"
          className="editor-view-switch"
          aria-label={label}
          title={label}
        >
          <Icon className="editor-view-icon" size={14} aria-hidden="true" />
          <span>{value === 'markdown' ? 'Markdown' : 'Visual'}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <PanelDropdownContent size="1" align="end" aria-label="Editor view">
        <DropdownMenu.RadioGroup
          value={value}
          onValueChange={(view) => onChange(view as EditorView)}
        >
          <DropdownMenu.RadioItem value="visual">
            <FileText size={14} aria-hidden="true" /> Visual
          </DropdownMenu.RadioItem>
          <DropdownMenu.RadioItem value="markdown">
            <Code2 size={14} aria-hidden="true" /> Markdown
          </DropdownMenu.RadioItem>
        </DropdownMenu.RadioGroup>
      </PanelDropdownContent>
    </DropdownMenu.Root>
  );
}
