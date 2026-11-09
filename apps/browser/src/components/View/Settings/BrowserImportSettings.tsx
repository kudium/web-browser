import { useRef, useState } from 'react';
import { Button, Select, Tabs, TextArea } from '@radix-ui/themes';
import { Folder, Layers, Globe } from 'lucide-react';
import { BrowserMigrationSettings } from './BrowserMigrationSettings';
import {
  importBrowsers,
  ImportedLink,
  parseBrowserLinks,
} from '../../../browser/browserImport';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { ImportOrganizationChoices } from './ImportOrganizationChoices';
import { buildImportedWorkspace } from '../../../browser/importWorkspace';
import { AppManager } from '../../../utils/AppManager';
import { SpaceManager } from '../../../utils/SpaceManager';

export function BrowserImportSettings() {
  const [method, setMethod] = useState<'browser' | 'export'>('browser');
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [source, setSource] = useState<string>(importBrowsers[0]);
  const [text, setText] = useState('');
  const [links, setLinks] = useState<ImportedLink[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [organization, setOrganization] = useState({
    foldersAsGroups: true,
    spacesAsFolders: true,
  });
  const [space, setSpace] = useState(
    () => SpaceManager.getAll()[0]?.id || 'default'
  );
  const review = (value: string, format: 'html' | 'links' | 'markdown') => {
    setMessage('');
    setLinks([]);
    try {
      setLinks(parseBrowserLinks(value, format));
    } catch (error) {
      setMessage(String((error as Error).message));
    }
  };
  const importLinks = () => {
    try {
      const existing = AppManager.getStored();
      const previousSpaces = SpaceManager.getAll();
      const plan = buildImportedWorkspace(
        links,
        previousSpaces,
        space,
        source,
        organization
      );
      const changed =
        JSON.stringify(plan.spaces) !== JSON.stringify(previousSpaces);
      if (changed) SpaceManager.set(plan.spaces);
      try {
        AppManager.set([
          ...existing,
          ...plan.apps.map((app, index) => ({
            ...app,
            position: existing.length + index + 1,
          })),
        ]);
        const savedIds = new Set(AppManager.getStored().map((app) => app.id));
        if (plan.apps.some((app) => !savedIds.has(app.id)))
          throw new Error('The import could not be saved. Please try again.');
      } catch (error) {
        try {
          AppManager.set(existing);
        } finally {
          if (changed) SpaceManager.set(previousSpaces);
        }
        throw error;
      }
      setMessage(`Imported ${links.length} links with their organization.`);
      setLinks([]);
      setText('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const instructionsByBrowser: Record<string, string> = {
    Arc: 'In Arc, open Settings → Advanced → Export Data. Choose the Arc Data Export.md file below to bring over Spaces, folders, Favorites, and pinned tabs.',
    Dia: 'Choose a bookmark HTML export to retain folders. Dia-specific Spaces can be preserved only when included in the export; flat links do not contain that information.',
    Chrome: 'In Chrome, open Bookmark Manager → ⋮ → Export bookmarks.',
    Edge: 'In Edge, open Favorites → ⋯ → Export favorites.',
    Firefox:
      'In Firefox, open Manage Bookmarks → Import and Backup → Export Bookmarks to HTML.',
    Safari:
      'Use Safari’s File menu to export bookmarks. Choose an HTML export if your version offers one; otherwise paste links below.',
  };
  const instructions =
    instructionsByBrowser[source] ||
    'If your browser offers a bookmark HTML export, choose it below. You can also copy links from your tabs or saved pages and paste one per line.';
  return (
    <Tabs.Root
      className="browser-import-settings"
      value={method}
      onValueChange={(value) => setMethod(value as 'browser' | 'export')}
    >
      <Tabs.List aria-label="Import method">
        <Tabs.Trigger value="browser" aria-label="From browser" disabled={busy}>
          From browser
        </Tabs.Trigger>
        <Tabs.Trigger value="export" aria-label="From export" disabled={busy}>
          From export
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="browser" forceMount hidden={method !== 'browser'}>
        <BrowserMigrationSettings />
      </Tabs.Content>
      <Tabs.Content
        className="browser-export-panel"
        value="export"
        forceMount
        hidden={method !== 'export'}
      >
        <p className="preference-note">
          Bring saved pages from another browser into a new Kudium group. You
          can import again at any time. Each export can contain up to 500 links
          and must be smaller than 8 MB.
        </p>
        <div className="preference-card">
          <div className="preference-row">
            <strong>From browser</strong>
            <Select.Root
              value={source}
              onValueChange={(value) => {
                setSource(value);
                setLinks([]);
                setMessage('');
              }}
            >
              <Select.Trigger aria-label="Import from browser" />
              <Select.Content>
                {importBrowsers.map((name) => (
                  <Select.Item key={name} value={name}>
                    {name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <div className="preference-row">
            <strong>Destination space</strong>
            <Select.Root value={space} onValueChange={setSpace}>
              <Select.Trigger aria-label="Import destination space" />
              <Select.Content>
                {SpaceManager.getAll().map((item) => (
                  <Select.Item key={item.id} value={item.id}>
                    {item.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <ImportOrganizationChoices
            source={source}
            options={organization}
            onChange={setOrganization}
            disabled={busy}
          />
        </div>
        <div className="preference-label">
          <span>Choose an export or paste links.</span>
          <PreferenceHint label="browser export">
            {instructions} Exports support up to 500 links and 8 MB. Folder
            organization is kept when present. Exports contain links, not
            passwords or website logins.
          </PreferenceHint>
        </div>
        <div className="migration-controls">
          <Button
            variant="soft"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Choose browser export
          </Button>
          {fileName && <span className="preference-note">{fileName}</span>}
          <input
            ref={fileInput}
            id="browser-bookmark-file"
            aria-label="Browser export file"
            hidden
            type="file"
            accept=".html,.htm,.md,text/html,text/markdown"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setFileName(file.name);
              setBusy(true);
              setLinks([]);
              setMessage('');
              try {
                if (file.size > 8 * 1024 * 1024)
                  throw new Error('Choose a file smaller than 8 MB.');
                review(
                  await file.text(),
                  /\.md$/i.test(file.name) ? 'markdown' : 'html'
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <p className="preference-note">Or paste links, one per line</p>
        <TextArea
          aria-label="Links to import"
          placeholder="https://example.com"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setLinks([]);
          }}
          rows={4}
        />
        <Button
          variant="soft"
          disabled={busy || !text.trim()}
          onClick={() => review(text, 'links')}
        >
          Review links
        </Button>
        {links.length > 0 && (
          <div className="import-structure-summary">
            <span>
              <Globe size={16} />
              {links.length} links
            </span>
            <span>
              <Layers size={16} />
              {
                new Set(links.map((link) => link.spaceName).filter(Boolean))
                  .size
              }{' '}
              spaces
            </span>
            <span>
              <Folder size={16} />
              {
                new Set(
                  links
                    .filter((link) => link.folderPath?.length)
                    .map((link) =>
                      JSON.stringify([link.spaceName, link.folderPath])
                    )
                ).size
              }{' '}
              folders
            </span>
          </div>
        )}
        {links.length > 0 && (
          <div className="browser-import-review">
            <strong>{links.length} links ready to import</strong>
            <ul>
              {links.slice(0, 5).map((link) => (
                <li key={link.url}>
                  {link.name}
                  <span>{new URL(link.url).hostname}</span>
                </li>
              ))}
            </ul>
            {links.length > 5 && <p>And {links.length - 5} more</p>}
            <Button onClick={importLinks}>Import {links.length} links</Button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </Tabs.Content>
    </Tabs.Root>
  );
}
