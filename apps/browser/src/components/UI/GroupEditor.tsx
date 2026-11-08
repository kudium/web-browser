/* Optional view notifications keep standalone group editors supported. */
/* eslint-disable react/require-default-props */
import { Button, TextField, Text, Select, Callout } from '@radix-ui/themes';
import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Shield, ArrowLeft } from 'lucide-react';
import { GroupAccessGate } from './GroupAccessGate';
import { IApp } from '../../types';
import { browser } from '../../browser/client';
import { AppManager } from '../../utils/AppManager';
import { SpaceManager } from '../../utils/SpaceManager';
import { GroupSettings, updateGroupSettings } from '../../utils/groupSettings';
import { groupKey, loginProfileKey } from '../../utils/groups';
import { GroupPicker } from './GroupPicker';
import { aiGroups, aiGroupId } from '../../browser/aiGroups';
import { PersonalData } from '../View/Settings/PasswordManager';
import { GroupIcon } from './GroupIcon';
import { IconPicker } from './IconPicker';
import { DeveloperProjectSection } from './DeveloperProjectSection';

function GroupEditorContent({
  item,
  close,
  onPersonalDataChange,
}: {
  item: IApp;
  close: () => void;
  onPersonalDataChange?: (open: boolean) => void;
}) {
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
    slug: aiGroups(AppManager.getAll()).find(
      (group) => group.id === aiGroupId(item)
    )?.slug,
    emoji: item.sessionIconEmoji || '',
    image: item.sessionIconImage || '',
    homeURL: item.sessionHomeURL || '',
    spaceId: item.spaceId || 'default',
    folderId: item.folderId || '',
    placement: item.favorite ? 'favorite' : defaultPlacement,
  });
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
          let home: URL | undefined;
          if (draft.homeURL.trim()) {
            try {
              home = new URL(draft.homeURL.trim());
            } catch {
              throw new Error('Enter a full home-page URL, or leave it blank.');
            }
          }
          if (home && !['https:', 'http:'].includes(home.protocol))
            throw new Error('Use an HTTP or HTTPS home page.');
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
          AppManager.set(
            updateGroupSettings(AppManager.getAll(), item, {
              ...draft,
              name: draft.name.trim(),
              homeURL: home?.href || '',
            })
          );
          close();
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
            <Text as="label" size="2">
              Group name
              <TextField.Root
                aria-label="Group name"
                required
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
              />
            </Text>
            <Text as="label" size="2">
              AI reference
              <TextField.Root
                aria-label="Group slug"
                title="Use this reference to identify the group in AI requests."
                required
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                value={draft.slug || ''}
                onChange={(event) => change({ slug: event.target.value })}
              >
                <TextField.Slot>@</TextField.Slot>
              </TextField.Root>
            </Text>
          </div>
        </div>
        <section
          className="group-editor-organization"
          aria-label="Organization"
        >
          <div className="group-editor-section-label">Organization</div>
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
        </section>
        <DeveloperProjectSection
          sourceId={item.id}
          active
          settingsOnly
          onOpenDeveloper={() => {
            window.dispatchEvent(
              new CustomEvent('touchbox-open-group-developer', {
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
        <details className="group-editor-advanced">
          <summary>Website &amp; session</summary>
          <div className="group-editor-advanced-content">
            <Text as="label" size="2">
              Home page
              <TextField.Root
                aria-label="Group home page"
                placeholder="https://example.com"
                title="Saved as the first tab in this group. Leave blank to disable."
                inputMode="url"
                value={draft.homeURL}
                onChange={(event) => change({ homeURL: event.target.value })}
              />
            </Text>
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
        <Button type="submit">Save changes</Button>
      </div>
    </form>
  );
}

export function GroupEditor({
  item,
  close,
  onPersonalDataChange,
}: {
  item: IApp;
  close: () => void;
  onPersonalDataChange?: (open: boolean) => void;
}) {
  return (
    <GroupAccessGate item={item}>
      <GroupEditorContent
        item={item}
        close={close}
        onPersonalDataChange={onPersonalDataChange}
      />
    </GroupAccessGate>
  );
}
