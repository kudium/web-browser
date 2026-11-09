import { useState, useRef, FormEvent } from 'react';
import { Button, TextField, TextArea, Badge, Dialog } from '@radix-ui/themes';
import { SettingsLibrary } from '../../UI/SettingsLibrary';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { BrowserPreferences } from '../../../browser/preferences';
import {
  SearchEngine,
  validateSearchEngines,
} from '../../../browser/searchEngines';

export function SearchEngineManager({
  preferences,
  busy,
  save,
}: {
  preferences: BrowserPreferences;
  busy: boolean;
  save: (patch: Partial<BrowserPreferences>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<SearchEngine | null>(null);
  const [error, setError] = useState('');
  const editorTrigger = useRef<HTMLElement | null>(null);
  const edit = (engine?: SearchEngine) => {
    editorTrigger.current = document.activeElement as HTMLElement;
    setError('');
    setDraft(
      engine ? { ...engine } : { id: crypto.randomUUID(), name: '', url: '' }
    );
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    try {
      const engines = validateSearchEngines(
        preferences.searchEngines.some((engine) => engine.id === draft.id)
          ? preferences.searchEngines.map((engine) =>
              engine.id === draft.id ? draft : engine
            )
          : [...preferences.searchEngines, draft]
      );
      if (await save({ searchEngines: engines })) setDraft(null);
      else setError('Couldn’t save the search engine. Try again.');
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const remove = (id: string) => {
    const engines = preferences.searchEngines.filter(
      (engine) => engine.id !== id
    );
    if (!engines.length) return;
    if (draft?.id === id) setDraft(null);
    save({
      searchEngines: engines,
      searchEngine:
        preferences.searchEngine === id
          ? engines[0].id
          : preferences.searchEngine,
    });
  };
  return (
    <>
      <div className="preference-row">
        <div>
          <div className="preference-label">
            <strong>Search engines</strong>
            <PreferenceHint label="Search engines">
              Add your preferred search services. Deleting the default selects
              the next engine.
            </PreferenceHint>
          </div>
        </div>
      </div>
      <SettingsLibrary
        renderToolbar={(engine) => (
          <>
            <Button
              size="1"
              variant="ghost"
              color="gray"
              aria-label="Add search engine"
              disabled={busy || !!draft}
              onClick={() => edit()}
            >
              +
            </Button>
            <Button
              size="1"
              variant="ghost"
              color="gray"
              aria-label={
                engine ? `Delete ${engine.name}` : 'Delete search engine'
              }
              disabled={
                busy || !engine || preferences.searchEngines.length === 1
              }
              onClick={() => engine && remove(engine.id)}
            >
              −
            </Button>
          </>
        )}
        label="Search engines"
        entries={preferences.searchEngines}
      >
        {(engine) => (
          <div className="preference-row search-engine-row" key={engine.id}>
            <div className="search-engine-copy">
              <strong>{engine.name}</strong>
              {preferences.searchEngine === engine.id && (
                <Badge color="gray" ml="2">
                  Default
                </Badge>
              )}
              <p title={engine.url}>
                {engine.keyword && (
                  <>
                    <code>{engine.keyword}</code> ·{' '}
                  </>
                )}
                {engine.url}
              </p>
            </div>
            <div className="preference-actions search-engine-actions">
              {preferences.searchEngine !== engine.id && (
                <Button
                  variant="soft"
                  className="search-engine-default"
                  disabled={busy}
                  onClick={() => save({ searchEngine: engine.id })}
                >
                  Set default
                </Button>
              )}
              <Button
                variant="soft"
                color="gray"
                className="search-engine-edit"
                disabled={busy}
                aria-label={`Edit ${engine.name}`}
                onClick={() => edit(engine)}
              >
                Edit
              </Button>
            </div>
          </div>
        )}
      </SettingsLibrary>
      {draft && (
        <Dialog.Root
          open={!!draft}
          onOpenChange={(open) => {
            if (!open && !busy) setDraft(null);
          }}
        >
          <Dialog.Content
            className="search-engine-dialog"
            maxWidth="560px"
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editorTrigger.current?.focus();
            }}
          >
            <div className="search-engine-dialog-heading">
              <Dialog.Title mb="1">
                {preferences.searchEngines.some(
                  (engine) => engine.id === draft.id
                )
                  ? 'Edit search engine'
                  : 'New search engine'}
              </Dialog.Title>
              <Dialog.Description size="2">
                Choose a name, shortcut, and search URL.
              </Dialog.Description>
            </div>
            <form className="search-engine-dialog-form" onSubmit={submit}>
              <div className="search-engine-editor">
                {/* Radix renders the input with the matching id. */}
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label htmlFor="search-engine-name">Name</label>
                <TextField.Root
                  autoFocus
                  id="search-engine-name"
                  aria-label="Search engine name"
                  placeholder="e.g. Brave Search"
                  value={draft.name}
                  maxLength={80}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label htmlFor="search-engine-keyword">
                  Shortcut (optional)
                </label>
                <TextField.Root
                  id="search-engine-keyword"
                  aria-label="Search shortcut"
                  placeholder="e.g. jira"
                  value={draft.keyword || ''}
                  maxLength={32}
                  onChange={(event) =>
                    setDraft({ ...draft, keyword: event.target.value })
                  }
                />
                <p>
                  Type the name or shortcut in the command bar, press Tab, then
                  enter your search.
                </p>
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label htmlFor="search-engine-url">Search URL</label>
                <TextArea
                  rows={3}
                  resize="vertical"
                  spellCheck={false}
                  autoCapitalize="none"
                  className="search-engine-url-input"
                  id="search-engine-url"
                  aria-label="Search URL"
                  placeholder="https://search.brave.com/search?q=%s"
                  value={draft.url}
                  onChange={(event) =>
                    setDraft({ ...draft, url: event.target.value })
                  }
                />
                <p>
                  Use <code>%s</code> where the search term belongs.
                </p>
                {error && <p role="alert">{error}</p>}
              </div>
              <div className="preference-actions search-engine-dialog-actions">
                <Button
                  type="button"
                  variant="soft"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  Save search engine
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </>
  );
}
