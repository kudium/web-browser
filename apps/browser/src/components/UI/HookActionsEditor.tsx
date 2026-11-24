/* eslint-disable import/no-relative-packages, jsx-a11y/label-has-associated-control */
import {
  actionContexts,
  actionTemplates,
  type HookAction,
} from '../../../../../packages/hooks/actions';
import { Button, DropdownMenu } from '@radix-ui/themes';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FormTextField } from './FormTextField';
import { CodeEditor } from './CodeEditor';

const contextLabels = {
  page: 'Page',
  selection: 'Selection',
  link: 'Link',
  input: 'Text field',
  password: 'Password field',
};
export function HookActionsEditor({
  actions,
  disabled,
  onChange,
}: {
  actions: HookAction[];
  disabled: boolean;
  onChange: (actions: HookAction[]) => void;
}) {
  const [selectedId, setSelectedId] = useState(actions[0]?.id);
  const selected = actions.find((a) => a.id === selectedId) || actions[0];
  const update = (patch: Partial<HookAction>) =>
    onChange(
      actions.map((a) => (a.id === selected?.id ? { ...a, ...patch } : a))
    );
  const add = (template?: Omit<HookAction, 'id'>) => {
    const next: HookAction = {
      ...(template || {
        name: 'New action',
        contexts: ['page'],
        source: 'return context.title;',
      }),
      id: crypto.randomUUID(),
    };
    onChange([...actions, next]);
    setSelectedId(next.id);
  };
  const examplesControl = (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button
              size="1"
              variant="ghost"
              color="gray"
              disabled={disabled || actions.length >= 20}
            >
              Examples <ChevronDown size={12} aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {actionTemplates.map((template) => (
              <DropdownMenu.Item
                key={template.name}
                onSelect={() => add(template)}
              >
                {template.name}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
  );
  return (
    <section className="hook-actions-editor" aria-label="Context menu actions">
      <div className="hook-editor-file-actions" role="group" aria-label="Action tools">
        {examplesControl}
        <Button size="1" variant="solid" className="hook-action-add" disabled={disabled || actions.length >= 20} onClick={() => add()}>
          Add action
        </Button>
        <Button asChild size="1" variant="ghost" color="gray">
          <a href="https://browser.kudium.com/tutorials/website-hooks" target="_blank" rel="noreferrer">Help</a>
        </Button>
      </div>
      <div className="hook-actions-toolbar"><span>Context menu</span></div>
      {!selected ? (
        <div className="hook-actions-empty">
          <strong>Add your first action</strong>
          <p>
            Choose where it appears, then write the script that runs when
            clicked.
          </p>
        </div>
      ) : (
        <div
          className="hook-actions-workspace"
          data-single={actions.length === 1}
        >
          {actions.length > 1 && (
            <nav className="hook-action-list" aria-label="Actions">
              {actions.map((action) => (
                <button
                  type="button"
                  key={action.id}
                  className="hook-action-list-item"
                  aria-pressed={selected.id === action.id}
                  onClick={() => setSelectedId(action.id)}
                >
                  <span>{action.name || 'Untitled action'}</span>
                  <small>
                    {action.contexts.map((c) => contextLabels[c]).join(' · ')}
                  </small>
                </button>
              ))}
            </nav>
          )}
          <div className="hook-action-detail" key={selected.id}>
            <div className="hook-action-name">
              <FormTextField
                label="Menu label"
                value={selected.name}
                maxLength={120}
                disabled={disabled}
                onChange={(e) => update({ name: e.target.value })}
              />
              <Button
                size="1"
                className="hook-action-delete"
                variant="ghost"
                color="gray"
                disabled={disabled}
                aria-label={`Delete ${selected.name}`}
                onClick={() =>
                  onChange(actions.filter((a) => a.id !== selected.id))
                }
              >
                Delete
              </Button>
            </div>
            <fieldset className="hook-action-contexts">
              <legend>Show on</legend>
              <div className="hook-action-options">
                {actionContexts.map((c) => (
                  <label key={c} data-checked={selected.contexts.includes(c)}>
                    <input
                      type="checkbox"
                      checked={selected.contexts.includes(c)}
                      disabled={
                        disabled ||
                        (selected.contexts.length === 1 &&
                          selected.contexts.includes(c))
                      }
                      onChange={(e) =>
                        update({
                          contexts: e.target.checked
                            ? [...selected.contexts, c]
                            : selected.contexts.filter((v) => v !== c),
                        })
                      }
                    />
                    {contextLabels[c]}
                  </label>
                ))}
              </div>
            </fieldset>

            <CodeEditor
              mode="action"
              value={selected.source}
              onChange={(source) => update({ source })}
              disabled={disabled}
              language="javascript"
              label={`${selected.name} handler`}
              maxLength={20000}
            />
          </div>
        </div>
      )}
    </section>
  );
}
