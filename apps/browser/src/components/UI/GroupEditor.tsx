/* Optional view notifications keep standalone group editors supported. */
/* eslint-disable react/require-default-props */
import { Button, TextField, Text, Select, Callout } from '@radix-ui/themes';
import { useState, useEffect, useRef, useId } from 'react';
import { ChevronRight, Shield, ArrowLeft, FolderPlus } from 'lucide-react';
import { GroupTabsSettings, GroupTabChanges } from './GroupTabsSettings';
import { PreferenceHint } from './PreferenceHint';
import { GroupAccessGate } from './GroupAccessGate';
import { IApp } from '../../types';
import { browser } from '../../browser/client';
import { AppManager } from '../../utils/AppManager';
import { SpaceManager } from '../../utils/SpaceManager';
import { GroupSettings, updateGroupSettings } from '../../utils/groupSettings';
import { groupKey, loginProfileKey, groupTabs } from '../../utils/groups';
import { GroupPicker } from './GroupPicker';
import { aiGroups, aiGroupId, groupSlug } from '../../browser/aiGroups';
import { PersonalData } from '../View/Settings/PasswordManager';
import { GroupIcon } from './GroupIcon';
import { IconPicker } from './IconPicker';
import type { SidebarDropResult } from '../../browser/sidebarDrop';
import { DeveloperProjectSection } from './DeveloperProjectSection';

function GroupEditorContent({
  item,
  close,
  onPersonalDataChange,
  creating = false,
  onCreated,
  droppedProject,
}: {
  item: IApp;
  close: () => void;
  onPersonalDataChange?: (open: boolean) => void;
  creating?: boolean;
  onCreated?: (tab: IApp) => void;
  droppedProject?: Extract<SidebarDropResult, { kind: 'project' }>;
}) {
  const [tabChanges, setTabChanges] = useState<GroupTabChanges>({
    edits: {},
    added: [],
    removed: [],
  });
  const referenceId = useId();
  const nameId = useId();
  const [showPersonalData, setShowPersonalData] = useState(false);
  useEffect(
    () => onPersonalDataChange?.(showPersonalData),
    [showPersonalData, onPersonalDataChange]
  );
  const spaces = SpaceManager.getAll();
  const defaultPlacement = item.pinned === false ? 'regular' : 'pinned';
  const ownProfile = item.sessionId || 'legacy';
  const groups = AppManager.getAll().filter(
    (tab) => !tab.archived && groupKey(tab) !== groupKey(item)
  );
  const loginOptions = [
    {
      id: ownProfile,
      name: 'This group’s session',
      detail: 'Use this group’s original browser session',
    },
    ...groups.map((tab) => ({
      id: loginProfileKey(tab),
      name: `Share with ${tab.sessionName || tab.name}`,
      detail: 'Use the same signed-in sessions and website data',
      group: tab,
    })),
  ];
  const [draft, setDraft] = useState<GroupSettings>({
    loginProfileId: loginProfileKey(item),
    name: item.sessionName || item.name,
    slug:
      aiGroups(AppManager.getAll()).find(
        (group) => group.id === aiGroupId(item)
      )?.slug || item.sessionSlug,
    emoji: item.sessionIconEmoji || '',
    image: item.sessionIconImage || '',
    homeURL: '',
    spaceId: item.spaceId || 'default',
    folderId: item.folderId || '',
    placement: item.favorite ? 'favorite' : defaultPlacement,
  });
  const [projectFolder, setProjectFolder] = useState(
    droppedProject?.folder || ''
  );
  const [linking, setLinking] = useState(false);
  const slugEdited = useRef(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [error]);
  const space = spaces.find((entry) => entry.id === draft.spaceId);
  const change = (patch: Partial<GroupSettings>) =>
    setDraft((previous) => ({ ...previous, ...patch }));
  if (showPersonalData)
    return (
      <div className="group-personal-data">
        <Button
          type="button"
          variant="ghost"
          color="gray"
          size="1"
          className="group-personal-data-back"
          onClick={() => setShowPersonalData(false)}
        >
          <ArrowLeft size={15} aria-hidden="true" /> Group settings
        </Button>
        <PersonalData group={item} tabs={AppManager.getAll()} />
      </div>
    );
  return (
    <form
      className="group-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          if (
            !draft.slug ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) ||
            draft.slug.length > 60
          )
            throw new Error(
              'Use a reference with lowercase letters, numbers and hyphens (up to 60 characters).'
            );
          if (
            aiGroups(AppManager.getAll()).some(
              (group) =>
                group.id !== aiGroupId(item) && group.slug === draft.slug
            )
          )
            throw new Error('That group reference is already used.');
          if (!draft.name.trim()) throw new Error('Enter a group name.');
          if (!spaces.some((entry) => entry.id === draft.spaceId))
            throw new Error('Choose an existing space.');
          if (draft.loginProfileId !== loginProfileKey(item)) {
            if (
              !loginOptions.some((option) => option.id === draft.loginProfileId)
            )
              throw new Error('Choose an available group.');
            const approved = await browser.confirm({
              message: 'Change this group’s browser session?',
              detail:
                'Its tabs will reload using the chosen browser storage. Shared groups will see the same cookies, logins and local website data. Names and tab groups remain separate. Existing storage is retained.',
              confirm: 'Change session',
            });
            if (!approved) return;
          }
          let source =
            creating && droppedProject
              ? (
                  await window.electron.siteDeveloper.createDroppedGroup({
                    token: droppedProject.token,
                    name: draft.name.trim(),
                    slug: draft.slug,
                  })
                ).tab
              : item;
          const additions = tabChanges.added.map((tab) => ({
            ...source,
            ...tab,
            customName: tab.name,
            archived: false,
          }));
          additions.forEach((tab) => {
            const url = new URL(tab.url);
            if (!['http:', 'https:'].includes(url.protocol))
              throw new Error('Use an HTTP or HTTPS tab address.');
          });
          if (creating && additions.length)
            source = { ...additions.shift()!, id: source.id };
          const current = AppManager.getAll().map((tab) => {
            const patch = tabChanges.edits[tab.id];
            if (patch?.url !== undefined && tab.url !== patch.url) {
              const url = new URL(patch.url);
              if (!['http:', 'https:'].includes(url.protocol))
                throw new Error('Use an HTTP or HTTPS tab address.');
            }
            return tabChanges.removed.includes(tab.id)
              ? { ...tab, archived: true }
              : { ...tab, ...patch };
          });
          if (
            !creating &&
            !groupTabs(current, source).some((tab) => !tab.archived) &&
            !additions.length
          )
            current.push({
              ...source,
              id: crypto.randomUUID(),
              name: 'New tab',
              customName: undefined,
              url: 'about:blank',
              archived: false,
            });
          const updated = updateGroupSettings(
            creating
              ? [...current, source, ...additions]
              : [...current, ...additions],
            source,
            { ...draft, name: draft.name.trim(), homeURL: '' }
          );
          AppManager.set(updated);
          if (creating) {
            const created = updated.find((tab) => tab.id === source.id)!;
            if (projectFolder && projectFolder !== droppedProject?.folder) {
              try {
                await window.electron.siteDeveloper.project(
                  created.id,
                  'link',
                  undefined,
                  projectFolder
                );
              } catch (reason) {
                AppManager.set(
                  AppManager.getAll().filter(
                    (tab) => tab.sessionId !== source.sessionId
                  )
                );
                throw reason;
              }
            }
            window.electron?.telemetry?.feature('group_created');
            onCreated?.(created);
          } else close();
        } catch (reason) {
          setError(String(reason instanceof Error ? reason.message : reason));
        }
      }}
    >
      <div className="group-editor-content">
        <div className="group-editor-identity">
          <IconPicker
            label="Choose group icon"
            emoji={draft.emoji || ''}
            image={draft.image || ''}
            preview={
              <GroupIcon
                item={{
                  ...item,
                  sessionIconEmoji: draft.emoji,
                  sessionIconImage: draft.image,
                }}
                tabs={AppManager.getAll()}
              />
            }
            onChange={change}
            renderDefaultChoice={(done) => (
              <Button
                type="button"
                variant="soft"
                color="gray"
                onClick={() => {
                  change({ emoji: '', image: '' });
                  done();
                }}
              >
                <GroupIcon
                  item={{ ...item, sessionIconEmoji: '', sessionIconImage: '' }}
                  tabs={AppManager.getAll()}
                />
                Use tab icons
              </Button>
            )}
          />
          <div className="group-editor-identity-fields">
            <div className="group-identity-field">
              <div className="group-reference-label">
                <Text as="label" size="2" htmlFor={nameId}>
                  Group name
                </Text>
              </div>
              <TextField.Root
                id={nameId}
                aria-label="Group name"
                required
                value={draft.name}
                autoFocus={creating}
                onChange={(event) =>
                  change({
                    name: event.target.value,
                    ...(creating && !slugEdited.current
                      ? { slug: groupSlug(event.target.value) }
                      : {}),
                  })
                }
              />
            </div>
            <div className="group-identity-field">
              <div className="group-reference-label">
                <Text as="label" size="2" htmlFor={referenceId}>
                  AI reference
                </Text>
                <PreferenceHint label="AI reference">
                  Mention this group in an AI request with @
                  {draft.slug || 'work'}, for example “@{draft.slug || 'work'}{' '}
                  update the website and test it.” The reference identifies the
                  group’s tabs and linked project. Use lowercase letters,
                  numbers and hyphens.
                </PreferenceHint>
              </div>
              <TextField.Root
                id={referenceId}
                aria-label="Group slug"
                maxLength={60}
                required
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                value={draft.slug || ''}
                onChange={(event) => {
                  slugEdited.current = true;
                  change({
                    slug: event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, '')
                      .replace(/-+/g, '-')
                      .replace(/^-/, '')
                      .slice(0, 60),
                  });
                }}
              >
                <TextField.Slot>@</TextField.Slot>
              </TextField.Root>
            </div>
          </div>
        </div>
        <GroupTabsSettings
          tabs={
            creating
              ? []
              : groupTabs(AppManager.getAll(), item).filter(
                  (tab) => !tab.archived
                )
          }
          changes={tabChanges}
          onChange={setTabChanges}
        />
        <details
          className="group-editor-organization"
          aria-label="Organization"
        >
          <summary>Organization</summary>
          <div className="group-editor-grouping">
            <Text as="label" size="2">
              Space
              <Select.Root
                value={draft.spaceId}
                onValueChange={(spaceId) => change({ spaceId, folderId: '' })}
              >
                <Select.Trigger aria-label="Group space" />
                <Select.Content>
                  {spaces.map((entry) => (
                    <Select.Item key={entry.id} value={entry.id}>
                      {entry.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Text>
            <Text as="label" size="2">
              Placement
              <Select.Root
                value={draft.placement}
                onValueChange={(placement) =>
                  change({ placement: placement as GroupSettings['placement'] })
                }
              >
                <Select.Trigger aria-label="Group placement" />
                <Select.Content>
                  <Select.Item value="regular">Regular</Select.Item>
                  <Select.Item value="pinned">Pinned</Select.Item>
                  <Select.Item value="favorite">Favorite</Select.Item>
                </Select.Content>
              </Select.Root>
            </Text>
            <Text as="label" size="2">
              Sidebar folder
              <Select.Root
                value={draft.folderId || 'none'}
                disabled={draft.placement === 'favorite'}
                onValueChange={(folderId) =>
                  change({ folderId: folderId === 'none' ? '' : folderId })
                }
              >
                <Select.Trigger aria-label="Group folder" />
                <Select.Content>
                  <Select.Item value="none">No folder</Select.Item>
                  {space?.folders.map((folder) => (
                    <Select.Item key={folder.id} value={folder.id}>
                      {folder.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Text>
          </div>
        </details>
        {creating && (
          <section className="group-project-folder">
            <div className="group-project-folder-header">
              <strong>Project folder</strong>
            </div>
            {projectFolder && (
              <Text as="div" size="2" style={{ overflowWrap: 'anywhere' }}>
                {projectFolder}
              </Text>
            )}
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={linking}
              onClick={async () => {
                setLinking(true);
                setError('');
                try {
                  const folder = await window.electron.siteDeveloper.project(
                    item.id,
                    'choose-folder'
                  );
                  if (folder) setProjectFolder(folder.path);
                } catch (reason) {
                  setError(String(reason));
                } finally {
                  setLinking(false);
                }
              }}
            >
              <FolderPlus size={16} />
              {projectFolder ? 'Change folder…' : 'Link folder…'}
            </Button>
          </section>
        )}
        {!creating && (
          <>
            <DeveloperProjectSection
              sourceId={item.id}
              active
              settingsOnly
              onOpenDeveloper={() => {
                window.dispatchEvent(
                  new CustomEvent('kudiumbrowser-open-group-developer', {
                    detail: item.id,
                  })
                );
                close();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              color="gray"
              className="group-editor-personal-data"
              onClick={() => setShowPersonalData(true)}
            >
              <Shield size={16} aria-hidden="true" />
              <span>Personal Data</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              color="gray"
              className="group-editor-personal-data"
              disabled={exporting}
              onClick={() => {
                setExporting(true);
                setError('');
                window.electron.siteDeveloper
                  .transfer('export', item.id)
                  .finally(() => setExporting(false))
                  .catch((reason) => setError(String(reason)));
              }}
            >
              <span>{exporting ? 'Exporting…' : 'Export Group…'}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Button>
          </>
        )}
        <details className="group-editor-advanced">
          <summary>Browser session</summary>
          <div className="group-editor-advanced-content">
            <div className="group-editor-login">
              <Text size="2" weight="medium">
                Browser session
              </Text>
              <GroupPicker
                options={loginOptions}
                value={draft.loginProfileId || ownProfile}
                onChange={(loginProfileId) => change({ loginProfileId })}
                label="Group browser session"
                disabled={false}
              />
              <Text size="1" color="gray">
                Choose another group to share its signed-in sessions, cookies
                and website data. Changes are shared between both groups.
              </Text>
            </div>
          </div>
        </details>
        {error && (
          <Callout.Root ref={errorRef} color="red" role="alert">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
      </div>
      <div className="group-editor-actions">
        <Button type="button" variant="soft" color="gray" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={linking}>
          {creating ? 'Create group' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export function GroupEditor({
  item,
  close,
  onPersonalDataChange,
  creating = false,
  onCreated,
  droppedProject,
}: {
  item: IApp;
  close: () => void;
  onPersonalDataChange?: (open: boolean) => void;
  creating?: boolean;
  onCreated?: (tab: IApp) => void;
  droppedProject?: Extract<SidebarDropResult, { kind: 'project' }>;
}) {
  return (
    <GroupAccessGate item={item}>
      <GroupEditorContent
        item={item}
        close={close}
        onPersonalDataChange={onPersonalDataChange}
        creating={creating}
        onCreated={onCreated}
        droppedProject={droppedProject}
      />
    </GroupAccessGate>
  );
}
