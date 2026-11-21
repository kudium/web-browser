import { loginCredentials } from './loginCredentials';
export { loginCredentials } from './loginCredentials';
import { dialog, Menu } from 'electron';
import type {
  BrowserWindow,
  WebContents,
  MenuItemConstructorOptions,
} from 'electron';
import type { PasswordVault } from './vault';
import { preferredLoginURL } from './loginRoute';
import {
  inspectLoginDocument,
  waitForLoginDocument,
  openLoginButton,
  fillLoginDocument,
  submitLoginDocument,
} from './loginDocument';

export function autoLoginAccounts(
  vault: PasswordVault,
  origin: string,
  scope?: string,
  accountId?: string,
) {
  const target = new URL(origin).origin;
  return vault
    .matchingItems(target, false, scope)
    .filter(
      (record) =>
        record.origin === target && (!accountId || record.id === accountId),
    )
    .flatMap((saved) => {
      const credentials = loginCredentials(saved);
      return credentials
        ? [
            {
              id: saved.id,
              title: saved.title,
              username: credentials.username,
              loginURL: saved.loginURL,
            },
          ]
        : [];
    });
}

export function buildAutoLoginMenu(
  accounts: Pick<
    ReturnType<typeof autoLoginAccounts>[number],
    'id' | 'title' | 'username'
  >[],
  run: (id?: string) => void,
): MenuItemConstructorOptions[] {
  if (!accounts.length) return [];
  if (accounts.length === 1)
    return [{ label: 'Auto login', click: () => run(accounts[0].id) }];
  return [
    {
      label: 'Auto login',
      submenu: accounts.map((account) => ({
        label: account.username
          ? `${account.title} · ${account.username}`
          : account.title,
        click: () => run(account.id),
      })),
    },
  ];
}

type Options = {
  owner: BrowserWindow;
  contents: WebContents;
  scope?: string;
  accountId?: string;
  check: () => void;
  authenticate: () => Promise<void>;
  read: <T>(work: (vault: PasswordVault) => T) => T;
  epoch: () => number;
};
const running = new WeakSet<WebContents>();
function bounded<T>(work: Promise<T>, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The login page did not respond in time.')),
      timeout,
    );
    work
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
        return value;
      })
      .catch(() => {
        clearTimeout(timer);
        reject(
          new Error('The login page changed or could not complete the action.'),
        );
      });
  });
}

/** Explicit native menu action. Only account metadata and receipts leave the vault. */
export async function runAutoLogin(options: Options) {
  const { contents, owner, scope } = options;
  if (running.has(contents)) return;
  running.add(contents);
  let websiteOwnsFeedback = false;
  try {
    options.check();
    const original = contents.getURL();
    const origin = new URL(original).origin;
    if (!original.startsWith('https:'))
      throw new Error('Auto login requires HTTPS.');
    await options.authenticate();
    const epoch = options.epoch();
    const check = () => {
      options.check();
      if (
        contents.isDestroyed() ||
        new URL(contents.getURL()).origin !== origin ||
        options.epoch() !== epoch
      )
        throw new Error(
          'The website or Personal Data access changed. Run Auto login again.',
        );
    };
    check();
    if (contents.getURL() !== original)
      throw new Error('The page changed. Run Auto login again.');
    const inspect = async () => {
      check();
      const state = await bounded(
        contents.mainFrame.executeJavaScript(
          `(${inspectLoginDocument.toString()})(${JSON.stringify(origin)})`,
        ),
      );
      check();
      return state as ReturnType<typeof inspectLoginDocument>;
    };
    const wait = async (goal: 'form' | 'signed-in', timeout: number) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        check();
        let ready!: () => void;
        const navigation = new Promise<void>((resolve) => {
          ready = () => resolve();
        });
        contents.once('dom-ready', ready);
        const remaining = Math.max(1, deadline - Date.now());
        try {
          const page = contents.mainFrame
            .executeJavaScript(
              `(${waitForLoginDocument.toString()})(${JSON.stringify(origin)},${JSON.stringify(goal)},${remaining},(${inspectLoginDocument.toString()}))`,
            )
            .catch(() => navigation);
          const result = await bounded(
            Promise.race([page, navigation]),
            remaining + 100,
          );
          check();
          if (result) return result as ReturnType<typeof inspectLoginDocument>;
        } finally {
          contents.removeListener('dom-ready', ready);
        }
      }
      return inspect();
    };
    let state = await inspect();
    if (state.signedIn && !state.form) return;
    const accounts = options.read((vault) =>
      autoLoginAccounts(vault, origin, scope, options.accountId),
    );
    if (!accounts.length)
      throw new Error(
        'Save a username and password for this website in Personal Data first.',
      );
    const choose = async (message: string, labels: string[]) => {
      const chooserURL = contents.getURL();
      const result = await dialog.showMessageBox(owner, {
        type: 'question',
        message,
        detail: origin,
        buttons: [...labels, 'Cancel'],
        cancelId: labels.length,
        defaultId: 0,
        noLink: true,
      });
      check();
      if (contents.getURL() !== chooserURL)
        throw new Error(
          'The page changed while choosing a login. Run Auto login again.',
        );
      return result.response < labels.length ? result.response : undefined;
    };
    let account = options.accountId
      ? accounts.find((entry) => entry.id === options.accountId)
      : accounts.length === 1
        ? accounts[0]
        : undefined;
    if (!account) {
      const id = await new Promise<string | undefined>((resolve) => {
        Menu.buildFromTemplate(
          accounts.map((entry) => ({
            label: `${entry.title} · ${entry.username}`,
            click: () => resolve(entry.id),
          })),
        ).popup({ window: owner, callback: () => resolve(undefined) });
      });
      check();
      account = accounts.find((entry) => entry.id === id);
      if (!account) return;
    }
    const accountId = account.id;
    let hint: string | undefined;
    try {
      if (account.loginURL) hint = preferredLoginURL(account.loginURL, origin);
    } catch {
      /* Stale hints do not authorize another website. */
    }
    // Prefer a currently rendered form. A learned path never restricts filling.
    if (!state.form) {
      let destinations = state.destinations;
      if (hint)
        destinations = destinations
          .slice()
          .sort((a, b) => Number(b.url === hint) - Number(a.url === hint));
      if (!destinations.length && hint)
        destinations = [{ url: hint, label: 'Remembered login page' }];
      if (!destinations.length)
        throw new Error(
          'Open this website’s login page, then choose Auto login. Its login route can be remembered after signing in.',
        );
      const index =
        destinations.length === 1 || (hint && destinations[0]?.url === hint)
          ? 0
          : await choose(
              'Choose the login page',
              destinations.map(
                (entry) =>
                  `${entry.label}${entry.url ? ` — ${new URL(entry.url).pathname}` : ''}`,
              ),
            );
      if (index === undefined) return;
      const destination = destinations[index];
      check();
      if (destination.url) {
        if (new URL(destination.url).origin !== origin)
          throw new Error('The login page belongs to another website.');
        await bounded(contents.loadURL(destination.url), 20000);
      } else {
        const opened = await bounded(
          contents.mainFrame.executeJavaScript(
            `(${openLoginButton.toString()})(${JSON.stringify(origin)},${JSON.stringify(contents.getURL())},${JSON.stringify(destination.label)})`,
            true,
          ),
        );
        if (!opened)
          throw new Error(
            'The sign-in button changed. Open the login page and try again.',
          );
      }
      state = await wait('form', 15000);
    }
    if (state.signedIn && !state.form) return;
    if (!state.form)
      throw new Error(
        'A complete login form was not found. Multi-step login, verification, or a changed page needs your input.',
      );
    const expected = contents.getURL();
    check();
    const code = options.read((vault) => {
      const credentials = loginCredentials(
        vault.forFill(accountId, origin, false, scope),
      );
      if (!credentials) throw new Error('The saved login changed.');
      return `(${fillLoginDocument.toString()})(${JSON.stringify(origin)},${JSON.stringify(expected)},${JSON.stringify(credentials.username)},${JSON.stringify(credentials.password)})`;
    });
    let filled: unknown;
    try {
      filled = await bounded(contents.mainFrame.executeJavaScript(code, true));
    } catch {
      throw new Error('The login form changed before it could be filled.');
    }
    check();
    if (!filled || contents.getURL() !== expected)
      throw new Error('The login form could not be filled safely.');
    // Give controlled inputs one render cycle before inspecting the submit button.
    await new Promise((resolve) => setTimeout(resolve, 100));
    check();
    websiteOwnsFeedback = true;
    const submitted = await bounded(
      contents.mainFrame.executeJavaScript(
        `(${submitLoginDocument.toString()})(${JSON.stringify(origin)},${JSON.stringify(expected)})`,
        true,
      ),
    );
    // The website owns validation and verification feedback after filling.
    if (!submitted) return;
    state = await wait('signed-in', 10000);
    if (!state.signedIn || state.form) return;
    check();
    options.read((vault) => {
      const saved = vault.forFill(accountId, origin, false, scope);
      vault.save(
        { ...saved, loginURL: preferredLoginURL(expected, origin) },
        scope,
      );
    });
    // Never send the user back to a login page, or replay form data.
    if (
      original !== expected &&
      !/\/(?:login|signin|sign-in|auth)(?:\/|$)/i.test(
        new URL(original).pathname,
      )
    ) {
      check();
      await bounded(contents.loadURL(original), 20000);
    }
  } catch (error) {
    if (!websiteOwnsFeedback) throw error;
  } finally {
    running.delete(contents);
  }
}
