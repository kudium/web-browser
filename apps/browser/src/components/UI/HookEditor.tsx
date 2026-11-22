import { HookActionsEditor } from './HookActionsEditor';
// eslint-disable-next-line import/no-relative-packages
import type { HookAction } from '../../../../../packages/hooks/actions';
import { HookPresets } from './HookPresets';
import { Import as ImportIcon } from 'lucide-react';
/* Optional props use parameter defaults. */
/* eslint-disable react/require-default-props */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Tabs } from '@radix-ui/themes';
import { CodeEditor } from './CodeEditor';
import { PreferenceHint } from './PreferenceHint';
export type HookStage = 'before' | 'after' | 'css';
function preferredStage(code: Record<HookStage, string> & { actions?: HookAction[] }) {
  return (['after', 'before', 'css'] as const).find((phase) => code[phase].trim())
    ?? (code.actions?.length ? 'actions' : 'after');
}
export function HookEditor({
  code,
  onChange,
  disabled,
  stage,
  selectionKey,
  onStageChange,
  jumpLine,
  children,
  examples,
  maxLength = 100000,
}: {
  code: Record<HookStage, string> & { actions?: HookAction[] };
  onChange: (patch: Partial<Record<HookStage, string>> & { actions?: HookAction[] }) => void;
  disabled: boolean;
  stage?: HookStage;
  selectionKey?: string;
  onStageChange?: (stage: HookStage) => void;
  jumpLine?: { line: number; token: number };
  children?: ReactNode;
  examples?: ReactNode;
  maxLength?: number;
}) {
  const [showActions, setShowActions] = useState(() => preferredStage(code) === 'actions');
  const [localStage, setLocalStage] = useState<HookStage>(() => {
    const preferred = preferredStage(code);
    return preferred === 'actions' ? 'after' : preferred;
  });
  const selection = useRef<{ key?: string } | undefined>(undefined);
  useEffect(() => {
    if (selection.current && selection.current.key === selectionKey) return;
    selection.current = { key: selectionKey };
    const preferred = preferredStage(code);
    setShowActions(preferred === 'actions');
    const phase = preferred === 'actions' ? 'after' : preferred;
    setLocalStage(phase);
    onStageChange?.(phase);
  }, [selectionKey, code, onStageChange]);
  useEffect(() => {
    if (jumpLine) setShowActions(false);
  }, [jumpLine]);
  const editor = stage ?? localStage;
  const importInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const stageLabels = {
    before: 'Before load',
    after: 'After load',
    css: 'CSS',
  };
  const stageHints = {
    before:
      'At document creation. Asynchronous work does not pause website scripts.',
    after:
      'After resources finish loading, and on navigation within this page.',
    css: 'Applied at document start and on route changes. Browser CSS rules still apply.',
  };
  return (
    <Tabs.Root
      value={showActions ? 'actions' : editor}
      onValueChange={(value) => {
        setShowActions(value === 'actions');
        if (value === 'actions') return;
        setLocalStage(value as HookStage);
        onStageChange?.(value as HookStage);
      }}
      className="site-hook-editor"
    >
      <div className="site-hook-editor-toolbar">
        <Tabs.List aria-label="Hook stage">
          {(['before', 'after', 'css'] as const).map((phase) => (
            <div className="site-hook-stage-tab" key={phase}>
              <Tabs.Trigger value={phase}>{stageLabels[phase]}</Tabs.Trigger>
              <PreferenceHint label={stageLabels[phase]}>
                {stageHints[phase]}
              </PreferenceHint>
            </div>
          ))}
          <Tabs.Trigger value="actions">Actions{code.actions?.length ? ` (${code.actions.length})` : ''}</Tabs.Trigger>
        </Tabs.List>
        <div className="hook-editor-file-actions" hidden={showActions}>
          {examples || (
            <HookPresets
              disabled={disabled}
              stage={editor}
              source={code[editor]}
              canRun={false}
              onInsert={(source, targetStage = editor) => {
                const combined = code[targetStage].trim()
                  ? `${code[targetStage]}

${
  targetStage === 'css'
    ? source
    : `;
{
${source}
}`
}`
                  : source;
                if (combined.length > maxLength) {
                  setImportError(
                    `Maximum ${maxLength.toLocaleString()} characters. Shorten this stage before inserting an example.`
                  );
                  return;
                }
                onChange({ [targetStage]: combined });
                setLocalStage(targetStage);
                onStageChange?.(targetStage);
                setImportError('');
              }}
            />
          )}
          <Button
            className="hook-editor-import"
            aria-label="Import"
            title="Import into this code tab"
            size="1"
            variant="ghost"
            color="gray"
            disabled={disabled}
            onClick={() => importInput.current?.click()}
          >
            <ImportIcon size={15} />
            Import
          </Button>
        </div>
      </div>
      <input
        ref={importInput}
        type="file"
        hidden
        aria-label="Import hook file"
        accept={
          editor === 'css'
            ? '.css,text/css'
            : '.js,.mjs,.txt,text/javascript,text/plain'
        }
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const phase = editor;
          try {
            if (file.size > maxLength * 4)
              throw new Error(
                `Choose a file with at most ${maxLength.toLocaleString()} characters.`
              );
            const source = await file.text();
            if (source.length > maxLength)
              throw new Error(
                `Maximum ${maxLength.toLocaleString()} characters.`
              );
            onChange({ [phase]: source });
            setImportError('');
          } catch (error) {
            setImportError(String(error).replace(/^Error: /, ''));
          }
        }}
      />
      {importError && (
        <p className="site-hook-import-error" role="alert">
          {importError}
        </p>
      )}
      <Tabs.Content value={editor} className="site-hook-editor-body" hidden={showActions}>
        {children}
        <CodeEditor
          // External value updates can be deferred by CodeMirror's typing latch.
          // A new hook must get its own document immediately, not queue behind it.
          key={`${selectionKey || "default"}:${editor}`}
          label={`${stageLabels[editor]} code`}
          jumpLine={jumpLine}
          language={editor === 'css' ? 'css' : 'javascript'}
          value={code[editor]}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(value) => onChange({ [editor]: value })}
        />
      </Tabs.Content>
      <Tabs.Content value="actions" className="site-hook-editor-body hook-actions-body">
        <HookActionsEditor actions={code.actions || []} disabled={disabled} onChange={(actions) => onChange({ actions })} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
