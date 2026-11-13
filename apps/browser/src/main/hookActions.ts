import {
  captureActionField,
  fillActionField,
  readActionFieldContext,
  fillActionForm,
} from './hookActionField';
import { runActionSandbox } from './hookActionSandbox';
import {
  BrowserWindow,
  dialog,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { randomInt, randomUUID } from 'crypto';
// eslint-disable-next-line import/no-relative-packages
import {
  actionMatchesContext,
  type HookAction,
  type HookActionContext,
} from '../../../../packages/hooks/actions';
import type { SiteDeveloperConfig } from '../browser/siteDeveloper';
import { effectiveHookConfig } from './globalHooks';
import { browserActivity } from './activity';
import { saveNoteWithActivity } from './noteActivity';
import { requestBrowserInput } from './browserInput';
import { fillActionPersonalData } from './hookActionPersonalData';
import { saveActionForm } from './hookActionSaveForm';

const ACTION_WORLD = 1109;
const running = new Set<number>();
const menuLifetimes = new WeakMap<WebContents, () => void>();
export interface ActionIdentity {
  groupId: string;
  sourceId: string;
  scope?: string;
}
/** Menu matching is declarative: never evaluate user scripts while opening a menu. */
export function hookActionMenu(
  window: BrowserWindow,
  contents: WebContents,
  params: ContextMenuParams,
  profile: string,
  identity: () => ActionIdentity | undefined,
  options: {
    config?: (url: string) => SiteDeveloperConfig;
    preview?: boolean;
  } = {}
): MenuItemConstructorOptions[] {
  // Embedded documents need a separately scoped field/content bridge; fail closed.
  const binding = identity();
  if (
    !binding ||
    (params.frame && params.frame !== contents.mainFrame) ||
    (params.frameURL && params.frameURL !== contents.getURL())
  )
    return [];
  const url = contents.getURL();
  const resolve =
    options.config ||
    ((pageURL: string) => effectiveHookConfig(profile, pageURL));
  const config = resolve(url);
  if (!config.enabled) return [];
  const hooks = [
    ...(config.actions?.length
      ? [
          {
            id: '',
            name: config.name || 'Default hook',
            actions: config.actions,
          },
        ]
      : []),
    ...(config.hooks || []),
  ];
  const password = params.formControlType === 'input-password';
  const target = {
    password: params.isEditable && password,
    input:
      params.isEditable &&
      !password &&
      [
        'none',
        'input-text',
        'input-search',
        'input-telephone',
        'input-url',
        'input-email',
        'input-number',
        'text-area',
      ].includes(params.formControlType),
    selection: !password && !!params.selectionText.trim(),
    link: !!params.linkURL,
  };
  const entries = hooks.flatMap((hook) =>
    (hook.actions || [])
      .filter(
        (action) => action.source.trim() && actionMatchesContext(action, target)
      )
      .map((action) => ({ hook, action }))
  );
  if (!entries.length) return [];
  menuLifetimes.get(contents)?.();
  const token = randomUUID();
  let navigated = false;
  const controller = new AbortController();
  const navigation = (
    _event: unknown,
    _url: string,
    _inPlace: boolean,
    mainFrame: boolean
  ) => {
    if (mainFrame) {
      navigated = true;
      controller.abort();
    }
  };
  contents.on('did-start-navigation', navigation);
  const capture = params.isEditable
    ? captureActionField(contents, params, token)
    : Promise.resolve(false);
  const cleanup = () => {
    navigated = true;
    controller.abort();
    clearTimeout(timer);
    if (!contents.isDestroyed())
      contents.removeListener('did-start-navigation', navigation);
    if (menuLifetimes.get(contents) === cleanup) menuLifetimes.delete(contents);
    if (!contents.isDestroyed())
      void contents
        .executeJavaScriptInIsolatedWorld(ACTION_WORLD, [
          {
            code: `if (globalThis.__hookActionField?.token === ${JSON.stringify(
              token
            )}) delete globalThis.__hookActionField; if(globalThis.__hookActionPageForms?.token===${JSON.stringify(
              token
            )})delete globalThis.__hookActionPageForms;`,
          },
        ])
        .catch(() => {});
  };
  const timer = setTimeout(cleanup, 60000);
  timer.unref();
  menuLifetimes.set(contents, cleanup);
  const current = (hookId: string, action: HookAction) => {
    if (
      navigated ||
      contents.isDestroyed() ||
      window.isDestroyed() ||
      contents.getURL() !== url ||
      JSON.stringify(identity()) !== JSON.stringify(binding)
    )
      throw new Error('The page changed or was locked. Open the menu again.');
    const latest = resolve(url);
    const actions = hookId
      ? latest.hooks?.find((h) => h.id === hookId)?.actions
      : latest.actions;
    if (
      !latest.enabled ||
      !actions?.some((a) => JSON.stringify(a) === JSON.stringify(action))
    )
      throw new Error(
        'This action changed or was disabled. Open the menu again.'
      );
  };
  const invoke = async (hook: (typeof hooks)[number], action: HookAction) => {
    if (running.has(contents.id))
      throw new Error('Another hook action is running on this page.');
    running.add(contents.id);
    try {
      current(hook.id, action);
      clearTimeout(timer);
      const safeURL = new URL(url);
      safeURL.username = '';
      safeURL.password = '';
      const context: HookActionContext = {
        apiVersion: 1,
        url: safeURL.href,
        title: contents.getTitle().slice(0, 500),
        ...(!password
          ? { selection: params.selectionText.slice(0, 30000) }
          : {}),
        ...(params.linkURL ? { link: params.linkURL.slice(0, 4096) } : {}),
        ...(params.isEditable
          ? { field: { type: params.formControlType } }
          : {}),
      };
      context.pageText = await contents.executeJavaScriptInIsolatedWorld(
        ACTION_WORLD,
        [{ code: "document.body?.innerText.slice(0, 100000) || ''" }]
      );
      if (params.isEditable && (await capture)) {
        const metadata = await readActionFieldContext(contents, token, true);
        context.field = metadata.field;
        if (metadata.form) context.form = metadata.form;
      }
      current(hook.id, action);
      const commands = await runActionSandbox(action, context, {
        signal: controller.signal,
        request: async (request, signal) => {
          current(hook.id, action);
          const recipient = `${hook.name || 'Website hook'} · ${action.name}`;
          const who = identity()!;
          const value = await requestBrowserInput(window, {
            recipient,
            request,
            fields: request.fields,
            signal,
            url,
            scope: who.scope,
            check: () => current(hook.id, action),
            preview: options.preview,
            binding: {
              profile,
              scope: JSON.stringify([who.groupId, who.scope || '']),
              origin: new URL(url).origin,
              hookId: hook.id,
              actionId: action.id,
              source: action.source,
            },
            detail: options.preview
              ? `Test input for “${recipient}”. Enter sample values; saved answers and Personal Data are unavailable in test windows.`
              : undefined,
          });
          current(hook.id, action);
          return value;
        },
      });
      for (const command of commands) {
        current(hook.id, action);
        const who = identity()!;
        const activityContext = {
          ...who,
          source: 'hook' as const,
          trigger: {
            sourceId: who.sourceId,
            profile,
            origin: new URL(url).origin,
            pageURL: context.url,
            hookId: hook.id || undefined,
            hookName: hook.name,
          },
        };
        if (command.capability === 'result') {
          await dialog.showMessageBox(window, {
            message: action.name,
            detail: command.input as string,
            buttons: ['Done'],
          });
        } else if (command.capability === 'ai.compose') {
          if (options.preview)
            await dialog.showMessageBox(window, {
              message: 'AI request preview',
              detail: command.input as string,
              buttons: ['Done'],
            });
          else window.webContents.send('browser-ai-selection', command.input);
        } else if (
          command.capability === 'field.write' ||
          command.capability === 'password.write' ||
          command.capability === 'password.generate'
        ) {
          if (
            !(await capture) ||
            !params.isEditable ||
            (command.capability !== 'field.write' ? !password : password)
          )
            throw new Error('This action cannot fill that field.');
          current(hook.id, action);
          const alphabet =
            'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
          const value =
            command.capability === 'password.generate'
              ? Array.from(
                  {
                    length: Math.min(
                      Math.max(24, context.field?.minLength || 0),
                      context.field?.maxLength ?? 10000,
                      10000
                    ),
                  },
                  () => alphabet[randomInt(alphabet.length)]
                ).join('')
              : (command.input as string);
          if (
            command.capability === 'password.generate' &&
            (!value.length || value.length < (context.field?.minLength || 0))
          )
            throw new Error(
              'This password field has incompatible length limits.'
            );
          await fillActionField(contents, token, value, password);
        } else if (command.capability === 'form.write') {
          if (!(await capture) || !params.isEditable || !context.form)
            throw new Error(
              'Open the action on a field in the form you want to fill.'
            );
          current(hook.id, action);
          await fillActionForm(
            contents,
            token,
            command.input as Array<{ key: string; value: string }>
          );
        } else if (command.capability === 'personalData.saveForm') {
          if (options.preview) {
            await dialog.showMessageBox(window, {
              message: 'Save form preview',
              detail:
                'Save form runs on your normal website tab. Test windows never save Personal Data.',
            });
            continue;
          }
          if (params.isEditable && !(await capture))
            throw new Error('This input is unavailable. Open Save form again.');
          await saveActionForm({
            owner: window,
            contents,
            token,
            url,
            scope: who.scope,
            signal: controller.signal,
            check: () => current(hook.id, action),
            page: !params.isEditable,
          });
        } else if (command.capability === 'personalData.fill') {
          if (options.preview) {
            await dialog.showMessageBox(window, {
              message: 'Personal Data test',
              detail:
                'The saved-field picker runs on your normal website tab. Personal Data is not filled into test windows.',
            });
            continue;
          }
          if (password || !params.isEditable || !(await capture))
            throw new Error('Open this action on a text input.');
          await fillActionPersonalData({
            owner: window,
            contents,
            token,
            url,
            scope: who.scope,
            field: context.field,
            signal: controller.signal,
            check: () => current(hook.id, action),
          });
        } else if (
          command.capability === 'notes.create' ||
          command.capability === 'activity.create'
        ) {
          const input = command.input as {
            title: string;
            body?: string;
            message?: string;
          };
          const note = command.capability === 'notes.create';
          current(hook.id, action);
          if (options.preview) {
            await dialog.showMessageBox(window, {
              message: note ? 'Note preview' : 'Activity preview',
              detail: note ? input.body : input.message,
            });
            continue;
          }
          if (note)
            saveNoteWithActivity(
              {
                id: '',
                kind: 'note',
                title: input.title,
                notes: input.body!,
                origin: '',
                username: '',
                password: '',
                fields: [],
                allowAI: false,
                source: {
                  label: hook.name,
                  url: context.url,
                  capturedAt: new Date().toISOString(),
                },
              },
              who.scope,
              activityContext,
              context.url
            );
          else
            browserActivity().create(
              { title: input.title, message: input.message, url: context.url },
              activityContext
            );
        }
      }
    } finally {
      running.delete(contents.id);
      clearTimeout(timer);
      cleanup();
    }
  };
  const actionItem = ({
    hook,
    action,
  }: (typeof entries)[number]): MenuItemConstructorOptions => ({
    label: action.name,
    click: () => {
      void invoke(hook, action).catch((error) => {
        if (!window.isDestroyed())
          void dialog.showMessageBox(window, {
            type: 'error',
            message: 'Hook action could not run',
            detail: String(error).slice(0, 2000),
          });
      });
    },
  });
  const groups = hooks
    .map((hook) => ({
      hook,
      items: entries
        .filter((entry) => entry.hook.id === hook.id)
        .map(actionItem),
    }))
    .filter((group) => group.items.length);
  const submenu: MenuItemConstructorOptions[] =
    entries.length <= 8
      ? groups.flatMap(({ hook, items }) => [
          {
            label: hook.name,
            type:
              process.platform === 'darwin'
                ? ('header' as const)
                : ('normal' as const),
            enabled: false,
          },
          ...items,
        ])
      : groups.map(({ hook, items }) => ({ label: hook.name, submenu: items }));
  return [{ label: 'Hooks', submenu }];
}
