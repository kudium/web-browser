import { Button, TextField, Text, Callout } from '@radix-ui/themes';
import { Globe2, Save, ImagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppManager } from '../../../../utils/AppManager';
import { IApp } from '../../../../types';
import { eventBus } from '../../../../utils/EventBus';
import { EVENT_KEY } from '../../../../utils/constant';
import { GroupEditor } from '../../../UI/GroupEditor';
import { AppIcon } from '../../../UI/AppIcon/AppIcon';

const empty = { name: '', url: '', icon: '' };
export function Custom() {
  const [draft, setDraft] = useState<Partial<IApp>>(empty);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(
    () =>
      eventBus.on(EVENT_KEY.EDIT_APP, (item: IApp) => {
        setDraft(item);
        setError('');
        setMessage('');
      }),
    []
  );
  if (draft.id)
    return (
      <GroupEditor
        item={draft as IApp}
        close={() => {
          setDraft(empty);
          setMessage('Group updated.');
        }}
      />
    );
  return (
    <form
      className="tab-content custom-form"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const url = new URL(
            /^https?:\/\//i.test(draft.url || '')
              ? draft.url!
              : `https://${draft.url}`
          );
          if (!['https:', 'http:'].includes(url.protocol))
            throw new Error('Use an HTTP or HTTPS website address.');
          const item = {
            ...draft,
            id: draft.id || crypto.randomUUID(),
            name: draft.name?.trim() || url.hostname,
            customName: draft.name?.trim() || undefined,
            url: url.href,
            icon: draft.icon || '',
          } as IApp;
          if (draft.id) {
            item.sessionName = item.name;
            item.sessionNameCustom = true;
            item.sessionNameGenerated = false;
            AppManager.set(
              AppManager.getAll().map((tab) => {
                if (tab.id === item.id) return item;
                if (
                  tab.sessionId === item.sessionId &&
                  (tab.spaceId || 'default') === (item.spaceId || 'default')
                )
                  return {
                    ...tab,
                    sessionName: item.name,
                    sessionNameCustom: true,
                    sessionNameGenerated: false,
                  };
                return tab;
              })
            );
          } else AppManager.add(item);
          setMessage(`${item.name} ${draft.id ? 'updated' : 'added'}.`);
          setError('');
          setDraft(empty);
        } catch {
          setError('Enter a valid HTTP or HTTPS website address.');
        }
      }}
    >
      <div className="icon-preview">
        <AppIcon icon={draft.icon} title={draft.name} />
        <div>
          <strong>{draft.name || 'Your next app'}</strong>
          <Text as="p" color="gray" size="2">
            A dedicated space for any website.
          </Text>
        </div>
      </div>
      {/* Radix TextField renders the associated native input. */}
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
      <label className="field-label" htmlFor="app-url">
        Website address
        <TextField.Root
          id="app-url"
          required
          placeholder="https://example.com"
          value={draft.url || ''}
          onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        >
          <TextField.Slot>
            <Globe2 size={16} />
          </TextField.Slot>
        </TextField.Root>
      </label>
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
      <label className="field-label" htmlFor="app-name">
        App name
        <TextField.Root
          id="app-name"
          placeholder="Optional — use the website title"
          value={draft.name || ''}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="field-label" htmlFor="app-icon">
        <span className="inline-icon">
          <ImagePlus size={16} />
          App icon{' '}
          <Text color="gray" size="1">
            Optional · PNG, JPEG or WebP
          </Text>
        </span>
        <input
          id="app-icon"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (
              !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
              file.size > 2 * 1024 * 1024
            ) {
              setError('Choose a PNG, JPEG or WebP image smaller than 2 MB.');
              return;
            }
            const reader = new FileReader();
            reader.onload = () =>
              setDraft((previous) => ({
                ...previous,
                icon: reader.result as string,
              }));
            reader.readAsDataURL(file);
          }}
        />
      </label>
      <Text color="gray" size="2">
        {draft.id
          ? 'Your existing group stays connected.'
          : 'This app will have its own persistent group.'}
      </Text>
      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {message && (
        <Text color="green" role="status">
          {message}
        </Text>
      )}
      <Button type="submit" size="3">
        <Save size={16} />
        {draft.id ? 'Save changes' : 'Add to workspace'}
      </Button>
    </form>
  );
}
