import { installPageTranslation } from '../browser/pageTranslation';
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
it('translates visible text, retains original content and leaves forms and attributes untouched', async () => {
  jest.useFakeTimers();
  const originalSheet = global.CSSStyleSheet;
  global.CSSStyleSheet = class {
    replaceSync() {}
  } as any;
  const originalShadow = HTMLElement.prototype.attachShadow;
  let shadow!: ShadowRoot;
  const attach = jest
    .spyOn(HTMLElement.prototype, 'attachShadow')
    .mockImplementation(function (this: HTMLElement, options) {
      shadow = originalShadow.call(this, options);
      return shadow;
    });
  const rect = jest
    .spyOn(Element.prototype, 'getClientRects')
    .mockReturnValue([{}] as any);
  document.documentElement.lang = 'es';
  document.body.innerHTML =
    '<h1>Hola mundo</h1><a href="/original">Abrir enlace</a><input value="Private input"><textarea>Private textarea</textarea><div contenteditable="true">Private editor</div><pre>Code</pre><span translate="no">Brand</span><div hidden>Hidden</div>';
  const listeners = new Map<string, Function>();
  const calls: string[][] = [];
  const bridge = {
    on: (channel: string, callback: Function) => {
      listeners.set(channel, callback);
    },
    invoke: jest.fn(async (_channel: string, request: any) => {
      if (request.action === 'settings')
        return { target: 'en', always: {}, never: false };
      if (request.action === 'languages')
        return [
          { code: 'en', name: 'English', targets: ['es'] },
          { code: 'es', name: 'Spanish', targets: ['en'] },
        ];
      if (request.action === 'translate') {
        calls.push(request.texts);
        return request.texts.map(
          (text: string) =>
            ({
              'Hola mundo': 'Hello world',
              'Abrir enlace': 'Open link',
              'Nuevo texto': 'New text',
            })[text] || text,
        );
      }
      return true;
    }),
  };
  const stop = installPageTranslation(bridge);
  await settle();
  expect(calls).toHaveLength(0);
  expect(document.querySelector('[data-kudium-translation]')).toBeNull();
  listeners.get('page-translation-action')!(null, 'translate');
  await settle();
  jest.advanceTimersByTime(100);
  await settle();
  expect(document.querySelector('h1')!.textContent).toBe('Hello world');
  expect(calls.flat()).toEqual(['Hola mundo', 'Abrir enlace']);
  expect(document.querySelector('a')!.getAttribute('href')).toBe('/original');
  expect(document.querySelector('input')!.value).toBe('Private input');
  expect(document.querySelector('textarea')!.value).toBe('Private textarea');
  expect(document.querySelector('[contenteditable]')!.textContent).toBe(
    'Private editor',
  );
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Nuevo texto';
  document.body.append(paragraph);
  await settle();
  jest.advanceTimersByTime(100);
  await settle();
  expect(paragraph.textContent).toBe('New text');
  listeners.get('page-translation-action')!(null, 'restore');
  await settle();
  expect(document.querySelector('h1')!.textContent).toBe('Hola mundo');
  expect(paragraph.textContent).toBe('Nuevo texto');
  const before = calls.length;
  document.body.append(document.createTextNode('Other content'));
  await settle();
  jest.advanceTimersByTime(500);
  await settle();
  expect(calls).toHaveLength(before);
  stop();
  attach.mockRestore();
  rect.mockRestore();
  global.CSSStyleSheet = originalSheet;
  jest.useRealTimers();
});
