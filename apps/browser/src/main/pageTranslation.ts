import {
  app,
  ipcMain,
  type WebContents,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import {
  OfflinePageTranslator,
  detectTranslationLanguage,
} from './offlineTranslation';
import translationModels from './translationModels.json';
import { getBrowserPreferences, updateBrowserPreferences } from './preferences';
const pages = new Map<
  number,
  {
    contents: WebContents;
    allowed: () => boolean;
    request?: AbortController;
    source?: string;
    target?: string;
    translated?: boolean;
    translating?: boolean;
    error?: string;
    phase?: 'downloading';
    changed: () => void;
    feedback?: boolean;
    notify: (title: string, message: string, type: 'info' | 'success' | 'error') => void;
  }
>();
let installed = false;
let engine: OfflinePageTranslator | undefined;
const translator = () => {
  if (!engine) {
    engine = new OfflinePageTranslator(
      path.join(app.getPath('userData'), 'translation-models'),
    );
    app.once('will-quit', () => engine?.dispose());
  }
  return engine;
};
const language = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value);
export function registerTranslationPage(
  contents: WebContents,
  allowed: () => boolean,
  changed: () => void = () => {},
  notify: (title: string, message: string, type: 'info' | 'success' | 'error') => void = () => {},
) {
  if (!pages.has(contents.id)) {
    pages.set(contents.id, { contents, allowed, changed, notify });
    const cancel = () => pages.get(contents.id)?.request?.abort();
    contents.on('did-start-navigation', (_event, _url, inPage, mainFrame) => {
      if (mainFrame && !inPage) {
        cancel();
        const page = pages.get(contents.id);
        if (page) {
          page.feedback = false;
          page.source = undefined;
          page.phase = undefined;
          page.translated = false;
          page.translating = false;
          page.error = undefined;
          page.changed();
        }
      }
    });
    contents.once('destroyed', () => {
      cancel();
      pages.delete(contents.id);
    });
  }
  if (installed) return;
  installed = true;
  ipcMain.handle('page-translation', async (event, input) => {
    const page = pages.get(event.sender.id);
    if (
      !page ||
      event.senderFrame !== page.contents.mainFrame ||
      !page.allowed() ||
      page.contents.isDestroyed() ||
      !/^https?:/.test(page.contents.getURL())
    )
      throw new Error('Page translation is unavailable here.');
    const expected = page.contents.getURL();
    const origin = new URL(expected).origin;
    const preferences = getBrowserPreferences().pageTranslation;
    if (input?.action === 'settings')
      return {
        ...preferences,
        target: page.target || userLanguage(),
        never: preferences.never.includes(origin),
      };
    if (input?.action === 'status') {
      if (
        !(input.source === 'auto' || language(input.source)) ||
        typeof input.translated !== 'boolean' ||
        typeof input.translating !== 'boolean'
      )
        throw new Error('Invalid translation status.');
      if (input.source !== 'auto' || !page.source) page.source = input.source;
      page.phase = undefined;
      page.translated = input.translated;
      page.translating = input.translating;
      page.error =
        typeof input.error === 'string' ? input.error.slice(0, 160) : undefined;
      if (page.feedback && (page.error || (page.translated && !page.translating))) {
        page.feedback = false;
        page.notify(page.error ? 'Couldn’t translate page' : `Translated to ${languageName(page.target || userLanguage())}`, page.error || 'Use the language button to show the original page.', page.error ? 'error' : 'success');
      }
      page.changed();
      return true;
    }
    if (input?.action === 'cancel') {
      page.request?.abort();
      return true;
    }
    if (input?.action === 'target') {
      if (!language(input.target) || !Object.keys(translationModels).some(pair => pair.slice(2) === input.target)) throw new Error('Unsupported translation language.');
      page.target = input.target; page.changed(); return true;
    }
    if (input?.action === 'detect') {
      if (typeof input.text !== 'string' || input.text.length > 4000)
        throw new Error('Invalid language sample.');
      const source = detectTranslationLanguage(input.text);
      if (source) {
        page.source = source;
        page.changed();
      }
      return source;
    }
    if (
      input?.action !== 'translate' ||
      !(input.source === 'auto' || language(input.source)) ||
      !language(input.target) ||
      !Array.isArray(input.texts) ||
      !input.texts.length ||
      input.texts.length > 50 ||
      input.texts.some(
        (text: unknown) =>
          typeof text !== 'string' || !text || text.length > 2000,
      ) ||
      input.texts.reduce(
        (length: number, text: string) => length + text.length,
        0,
      ) > 20000
    )
      throw new Error('Invalid translation request.');
    page.request?.abort();
    const controller = new AbortController();
    page.request = controller;
    try {
      const result = await translator().translate(
        {
          texts: input.texts,
          source:
            input.source === 'auto' && page.source ? page.source : input.source,
          target: page.target || userLanguage(),
        },
        controller.signal,
        () => {
          if (
            !controller.signal.aborted &&
            expected === page.contents.getURL()
          ) {
            if (page.feedback && page.phase !== 'downloading') page.notify('Downloading language pack…', 'Translation will start automatically. The pack is saved for offline use.', 'info');
            page.phase = 'downloading';
            page.translating = true;
            page.changed();
          }
        },
      );
      const body = { texts: result.texts };
      if (
        !page.allowed() ||
        expected !== page.contents.getURL() ||
        controller.signal.aborted
      )
        throw new Error('The page changed.');
      if (
        !Array.isArray(body.texts) ||
        body.texts.length !== input.texts.length ||
        body.texts.some(
          (text: unknown) => typeof text !== 'string' || text.length > 8000,
        )
      )
        throw new Error('Invalid translated text.');
      page.source = result.source;
      return body.texts;
    } finally {
      if (page.request === controller) page.request = undefined;
    }
  });
}
const userLanguage = () => app.getLocale().split('-')[0].toLowerCase() || 'en';
const languageName = (code: string) => {
  try {
    return (
      new Intl.DisplayNames([app.getLocale()], { type: 'language' }).of(code) ||
      code
    );
  } catch {
    return code;
  }
};
export function pageTranslationState(contents: WebContents) {
  const page = pages.get(contents.id);
  if (!page || !page.source || !/^https?:/.test(contents.getURL()))
    return undefined;
  const target = page.target || userLanguage(),
    preferences = getBrowserPreferences().pageTranslation;
  return {
    source: page.source,
    sourceName:
      page.source === 'auto' ? 'this language' : languageName(page.source),
    target,
    targets: [...new Set(Object.keys(translationModels).map(pair => pair.slice(2)))].filter(code => code !== page.source).map(code => ({code, name:languageName(code)})).sort((a,b)=>a.name.localeCompare(b.name)),
    targetName: languageName(target),
    needed: page.source !== 'auto' && page.source !== target,
    translated: !!page.translated,
    translating: !!page.translating,
    always: !!preferences.always[page.source],
    phase: page.phase,
    error: page.error,
  };
}
export function translationAction(contents: WebContents, action: string, target?: string) {
  const page = pages.get(contents.id);
  if (
    !page ||
    contents.isDestroyed() ||
    !page.allowed() ||
    !/^https?:/.test(contents.getURL())
  )
    return;
  if (action === 'page-translation-target') {
    if (!target || !pageTranslationState(contents)?.targets.some(item => item.code === target)) return;
    page.request?.abort(); page.target = target;
    const run = !!(page.translated || page.translating);
    page.translating = run; page.error = undefined; page.changed();
    contents.send('page-translation-action', run ? 'translate' : 'target', target);
    return;
  }
  if (
    action === 'page-translation-always' &&
    page.source &&
    page.source !== 'auto'
  ) {
    const preferences = getBrowserPreferences().pageTranslation,
      always = { ...preferences.always };
    if (always[page.source]) delete always[page.source];
    else always[page.source] = page.target || userLanguage();
    updateBrowserPreferences({
      pageTranslation: {
        ...preferences,
        always: Object.fromEntries(Object.entries(always).slice(-100)),
      },
    });
    page.changed();
    return;
  }
  if (action === 'page-translate') {
    if (page.translating) {
      page.feedback = true;
      page.notify(page.phase === 'downloading' ? 'Downloading language pack…' : 'Translating page…', 'Translation is already in progress.', 'info');
      return;
    }
    page.feedback = true; page.translating = true; page.error = undefined; page.phase = undefined; page.source ||= 'auto';
    page.changed(); page.notify('Translating page…', `Into ${languageName(page.target || userLanguage())}, on your device.`, 'info');
  }
  contents.send(
    'page-translation-action',
    action === 'page-translation-original' ? 'restore' : 'translate',
  );
}
export function translationMenu(
  contents: WebContents,
): MenuItemConstructorOptions {
  const original = pages.get(contents.id)?.translated;
  return {
    label: original
      ? 'Show original language'
      : `Translate to ${languageName(pages.get(contents.id)?.target || userLanguage())}`,
    enabled: pages.has(contents.id) && /^https?:/.test(contents.getURL()),
    click: () =>
      translationAction(
        contents,
        original ? 'page-translation-original' : 'page-translate',
      ),
  };
}
