/* Optional view notifications keep standalone group editors supported. */
/* eslint-disable react/require-default-props */
import { Button, TextField, Text, Select, Callout } from '@radix-ui/themes';
import { useState, useEffect, useRef, useId } from 'react';
import {
  ChevronRight,
  Shield,
  ArrowLeft,
  FolderPlus,
  Folder,
  Globe,
  Check,
} from 'lucide-react';
import { websiteAddress } from '../../utils/websiteAddress';
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
import { collectionProfile } from '../../utils/collectionGroups';
import type { SidebarDropResult } from '../../browser/sidebarDrop';
import { setDeveloperView } from '../../browser/developerViews';
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
  const [pendingTabAddress, setPendingTabAddress] = useState('');
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
    groupDisplay: item.groupDisplay || 'folder',
    sessionMode:
      item.sessionMode ||
      (creating && item.folderId ? 'collection' : 'separate'),
    name: item.sessionName || item.name,
    slug:
      aiGroups(AppManager.getAll()).find(
        (group) => group.id === aiGroupId(item)
      )?.slug || item.sessionSlug,
    emoji: item.sessionIconEmoji || '',
    image: item.sessionIconImage || '',
    focusColor: item.sessionFocusColor || '',
    homeURL: '',
    spaceId: item.spaceId || 'default',
    folderId: item.folderId || '',
    placement: item.favorite ? 'favorite' : defaultPlacement,
    aiTrusted: item.aiTrusted === true,
    aiTier: item.aiTier || 'auto',
  });
  const [projectFolder, setProjectFolder] = useState(
    droppedProject?.folder || ''
  );
  const [linking, setLinking] = useState(false);
  const slugEdited = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => setError(''), [tabChanges]);
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
          if (
            draft.folderId &&
            draft.placement !== 'favorite' &&
            !spaces
              .find((entry) => entry.id === draft.spaceId)
              ?.folders.some((collection) => collection.id === draft.folderId)
          )
            throw new Error('Choose an existing collection.');
          const selectedProfile =
            draft.sessionMode === 'collection' &&
            draft.folderId &&
            draft.placement !== 'favorite'
              ? collectionProfile(draft.spaceId, draft.folderId)
              : draft.loginProfileId;
          if (!creating && selectedProfile !== loginProfileKey(item)) {
            if (
              draft.sessionMode !== 'collection' &&
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
          const pendingUrl = pendingTabAddress.trim()
            ? websiteAddress(pendingTabAddress)
            : undefined;
          const addedTabs = [
            ...tabChanges.added,
            ...(pendingUrl ? [{
              id: crypto.randomUUID(),
              name: new URL(pendingUrl).hostname,
              url: pendingUrl,
            }] : []),
          ];
          let source =
            creating && droppedProject
              ? (
                  await window.electron.siteDeveloper.createDroppedGroup({
                    token: droppedProject.token,
                    name: draft.name.trim(),
                    slug: draft.slug,
                    spaceId: draft.spaceId,
                  })
                ).tab
              : item;
          const additions = addedTabs.map((tab) => ({
            ...source,
            customIconEmoji: undefined,
            customIconImage: undefined,
            focusColor: undefined,
            ...tab,
            name: tab.name.trim() || new URL(websiteAddress(tab.url)).hostname,
            customName: tab.name.trim() || undefined,
            url: websiteAddress(tab.url),
            archived: false,
          }));
          if (creating && additions.length)
            source = { ...additions.shift()!, id: source.id };
          const current = AppManager.getAll().map((tab) => {
            const edit = tabChanges.edits[tab.id];
            const patch = edit && {
              ...edit,
              ...(edit.customName !== undefined
                ? { customName: edit.customName.trim() }
                : {}),
              ...(edit.url !== undefined &&
              edit.url !== tab.url &&
              !tabChanges.removed.includes(tab.id)
                ? { url: websiteAddress(edit.url) }
                : {}),
            };
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
          let updated = updateGroupSettings(
            creating
              ? [...current, source, ...additions]
              : [...current, ...additions],
            source,
            {
              ...draft,
              loginProfileId: selectedProfile,
              sessionMode:
                draft.folderId && draft.placement !== 'favorite'
                  ? draft.sessionMode
                  : 'separate',
              name: draft.name.trim(),
              homeURL: '',
            }
          );
          if (tabChanges.order) {
            const ordered = tabChanges.order
              .map((id) =>
                updated.find(
                  (tab) =>
                    tab.id ===
                    (creating && id === addedTabs[0]?.id
                      ? source.id
                      : id)
                )
              )
              .filter((tab): tab is IApp => !!tab);
            const ids = new Set(ordered.map((tab) => tab.id));
            let index = 0;
            updated = updated
              .map((tab) => {
                if (!ids.has(tab.id)) return tab;
                const next = ordered[index];
                index += 1;
                return next;
              })
              .map((tab, position) => ({ ...tab, position: position + 1 }));
          }
          AppManager.set(updated);
          setPendingTabAddress('');
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
            setTabChanges({ added: [], edits: {}, removed: [] });
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
            focusColor={draft.focusColor}
            colorMode="background"
            onFocusColorChange={(color) => change({ focusColor: color || '' })}
            preview={
              <GroupIcon
                item={{
                  ...item,
                  groupDisplay: draft.groupDisplay,
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
                  item={{
                    ...item,
                    groupDisplay: draft.groupDisplay,
                    sessionIconEmoji: '',
                    sessionIconImage: '',
                  }}
                  tabs={AppManager.getAll()}
                />
                {draft.groupDisplay === 'folder'
                  ? 'Use folder icon'
                  : 'Use tab icons'}
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
          pendingAddress={pendingTabAddress}
          onPendingAddressChange={setPendingTabAddress}
          changes={tabChanges}
          onChange={setTabChanges}
        />
        <details
          className="group-editor-organization settings-disclosure"
          aria-label="Organization"
        >
          <summary className="settings-disclosure-header">
            <ChevronRight size={15} aria-hidden="true" />
            <span>Organization</span>
          </summary>
          <div className="settings-disclosure-content">
            <div className="group-editor-grouping">
              <Text as="label" size="2">
                Space
                <Select.Root
                  value={draft.spaceId}
                  onValueChange={(spaceId) =>
                    change({ spaceId, folderId: '', sessionMode: 'separate' })
                  }
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
                Collection
                <Select.Root
                  value={draft.folderId || 'none'}
                  disabled={draft.placement === 'favorite'}
                  onValueChange={(folderId) =>
                    change({
                      folderId: folderId === 'none' ? '' : folderId,
                      ...(!creating && folderId === 'none'
                        ? { sessionMode: 'separate' as const }
                        : {}),
                      ...(creating
                        ? {
                            sessionMode:
                              folderId === 'none' ? 'separate' : 'collection',
                          }
                        : {}),
                    })
                  }
                >
                  <Select.Trigger aria-label="Group collection" />
                  <Select.Content>
                    <Select.Item value="none">No collection</Select.Item>
                    {space?.folders.map((folder) => (
                      <Select.Item key={folder.id} value={folder.id}>
                        {folder.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Text>
            </div>
            <section className="group-presentation-settings">
              <Text as="p" size="2">
                Display group as
              </Text>
              <div
                className="group-display-options"
                role="radiogroup"
                aria-label="Group display"
              >
                {(['folder', 'stack'] as const).map((display) => (
                  <label
                    key={display}
                    className="group-display-option"
                    htmlFor={`${nameId}-${display}`}
                  >
                    <input
                      type="radio"
                      id={`${nameId}-${display}`}
                      name={`group-display-${nameId}`}
                      value={display}
                      checked={draft.groupDisplay === display}
                      onChange={() => change({ groupDisplay: display })}
                    />
                    <span className="group-display-card">
                      <span className="group-display-preview" aria-hidden="true">
                        {display === 'folder' ? (
                          <Folder size={20} />
                        ) : (
                          <span className="group-display-sites">
                            <Globe size={18} />
                            <Globe size={18} />
                            <Globe size={18} />
                          </span>
                        )}
                        <span className="group-display-preview-name">
                          {draft.name.trim() || 'My group'}
                        </span>
                        <ChevronRight size={13} />
                      </span>
                      <span className="group-display-caption">
                        {display === 'folder' ? 'Folder' : 'Stack'}
                        <Check size={14} aria-hidden="true" />
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <section className="group-trusted">
              <label className="group-trusted-option" htmlFor={`${nameId}-trusted`}>
                <input
                  type="checkbox"
                  id={`${nameId}-trusted`}
                  aria-label="Let agents act without asking in this group"
                  checked={draft.aiTrusted === true}
                  onChange={(event) => change({ aiTrusted: event.target.checked })}
                />
                <span>
                  <strong>Let agents act without asking in this group</strong>
                  <Text as="div" size="1" color="gray">
                    Skips the last confirmations (saved payment cards, uploads from
                    outside the linked folder, scope changes) for dev groups with
                    local pages and seed data. Shell commands after reading other
                    websites still ask.
                  </Text>
                </span>
              </label>
              <label className="group-tier-option" htmlFor={`${nameId}-tier`}>
                <span>
                  <strong>Model tier for this group</strong>
                  <Text as="div" size="1" color="gray">
                    Auto routes by request shape; Assist is the on-device model,
                    Local control a model through Ollama, Cloud your own API key.
                    {window.electron?.platform !== 'darwin'
                      ? ' On Windows and Linux there is no on-device Assist tier, so Auto starts at Local control.'
                      : ''}
                  </Text>
                </span>
                <select
                  id={`${nameId}-tier`}
                  value={draft.aiTier || 'auto'}
                  onChange={(event) =>
                    change({
                      aiTier: event.target.value as 'auto' | 'assist' | 'control' | 'cloud',
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="assist">Assist (on-device)</option>
                  <option value="control">Local control (Ollama)</option>
                  <option value="cloud">Cloud</option>
                </select>
              </label>
            </section>
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
              onProjectLinked={() => {
                setDeveloperView(aiGroupId(item), 'files');
                window.dispatchEvent(new CustomEvent('kudiumbrowser-open-group-developer', { detail: item.id }));
                close();
              }}
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
        <details className="group-editor-advanced settings-disclosure">
          <summary className="settings-disclosure-header">
            <ChevronRight size={15} aria-hidden="true" />
            <span>Browser session</span>
          </summary>
          <div className="group-editor-advanced-content settings-disclosure-content">
            <Text as="p" size="2">
              Browser session
            </Text>
            <Select.Root
              value={draft.sessionMode}
              onValueChange={(value: 'collection' | 'separate') =>
                change({
                  sessionMode: value,
                  loginProfileId:
                    value === 'separate' ? ownProfile : draft.loginProfileId,
                })
              }
            >
              <Select.Trigger aria-label="Session inheritance" />
              <Select.Content>
                <Select.Item value="separate">Separate session</Select.Item>
                <Select.Item
                  value="collection"
                  disabled={!draft.folderId || draft.placement === 'favorite'}
                >
                  Use collection session
                </Select.Item>
              </Select.Content>
            </Select.Root>
            <Text as="p" size="1" color="gray">
              Collection sessions share website logins. Group tabs, AI
              references and personal data remain separate.
            </Text>

            <div className="group-editor-login">
              <Text size="2" weight="medium">
                Browser session
              </Text>
              <GroupPicker
                options={loginOptions}
                value={draft.loginProfileId || ownProfile}
                onChange={(loginProfileId) =>
                  change({ loginProfileId, sessionMode: 'separate' })
                }
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
