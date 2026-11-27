/** Isolated preload runtime. Page scripts receive no translation bridge. */
export function installPageTranslation(bridge: {
  invoke: (channel: string, input?: any) => Promise<any>;
  on: (channel: string, listener: (...args: any[]) => void) => void;
  removeListener?: (
    channel: string,
    listener: (...args: any[]) => void,
  ) => void;
}) {
  let epoch = 0,
    active = false,
    busy = false,
    disposed = false;
  let sourceCode =
    document.documentElement?.lang.split('-')[0].toLowerCase() || 'auto';
  let settings: {
    target: string;
    always: Record<string, string>;
    never: boolean;
  } = { target: 'en', always: {}, never: false };
  const records = new Map<Text, { original: string; translated: string }>();
  const pending = new Set<Text>();
  const tasks = new Set<ReturnType<typeof setTimeout>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = (run: () => void) => {
    const id = setTimeout(() => {
      tasks.delete(id);
      run();
    }, 16);
    tasks.add(id);
  };
  const showStatus = (message: string) => {
    void bridge
      .invoke('page-translation', {
        action: 'status',
        source: sourceCode,
        translated: records.size > 0,
        translating: message === 'Translating…',
        error: message.startsWith('Error: ') ? message.slice(7) : undefined,
      })
      .catch(() => {});
  };
  const eligible = (node: Text) => {
    const parent = node.parentElement;
    return (
      !!parent &&
      node.isConnected &&
      !!node.data.trim() &&
      node.data.length <= 10000 &&
      !parent.closest(
        'script,style,noscript,pre,code,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[aria-hidden="true"]',
      )
    );
  };
  const restore = () => {
    epoch++;
    active = false;
    busy = false;
    observer.disconnect();
    clearTimeout(timer);
    for (const id of tasks) clearTimeout(id);
    tasks.clear();
    pending.clear();
    void bridge
      .invoke('page-translation', { action: 'cancel' })
      .catch(() => {});
    for (const [node, value] of records)
      if (node.isConnected && node.data === value.translated)
        node.data = value.original;
    records.clear();
    showStatus('Original page');
  };
  const watch = () => {
    if (active && document.body)
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
  };
  const collect = (root: Node) => {
    if (!active || disposed) return;
    const current = epoch;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const visibility = new WeakMap<Element, boolean>();
    let first = root.nodeType === Node.TEXT_NODE;
    const scan = () => {
      const end = performance.now() + 8;
      while (
        current === epoch &&
        active &&
        pending.size + records.size < 5000
      ) {
        const node = (first ? root : walker.nextNode()) as Text | null;
        first = false;
        if (!node) break;
        const saved = records.get(node);
        if (eligible(node) && (!saved || node.data !== saved.translated)) {
          const parent = node.parentElement!;
          if (!visibility.has(parent))
            visibility.set(parent, parent.getClientRects().length > 0 && getComputedStyle(parent).visibility !== 'hidden');
          if (visibility.get(parent)) pending.add(node);
        }
        if (performance.now() >= end) {
          later(scan);
          break;
        }
      }
      if (!busy && !pending.size && !tasks.size && records.size) showStatus('Translated');
      if (!busy && pending.size) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void flush();
        }, 100);
      }
    };
    scan();
  };
  const observer = new MutationObserver((changes) => {
    if (!active) return;
    for (const change of changes) {
      if (change.type === 'characterData') collect(change.target);
      else for (const node of Array.from(change.addedNodes)) collect(node);
    }
    for (const node of records.keys())
      if (!node.isConnected) records.delete(node);
  });
  async function flush() {
    if (!active || busy || disposed || !pending.size) return;
    busy = true;
    const current = epoch;
    const entries: { node: Text; original: string; parts: string[] }[] = [];
    let chars = 0,
      count = 0;
    for (const node of pending) {
      if (!eligible(node)) {
        pending.delete(node);
        continue;
      }
      const parts: string[] = []; let remaining = node.data;
      while (remaining.length > 2000) {
        const boundary = remaining.lastIndexOf(' ', 1999);
        const end = boundary > 1000 ? boundary + 1 : 2000;
        parts.push(remaining.slice(0, end)); remaining = remaining.slice(end);
      }
      if (remaining) parts.push(remaining);
      if (
        entries.length &&
        (chars + node.data.length > 20000 || count + parts.length > 50)
      )
        break;
      pending.delete(node);
      entries.push({ node, original: node.data, parts });
      chars += node.data.length;
      count += parts.length;
    }
    if (!entries.length) {
      busy = false;
      return;
    }
    showStatus('Translating…');
    try {
      const texts: string[] = await bridge.invoke('page-translation', {
        action: 'translate',
        source: sourceCode,
        target: settings.target,
        texts: entries.flatMap((entry) => entry.parts),
      });
      if (current !== epoch || !active) return;
      let offset = 0;
      observer.disconnect();
      for (const entry of entries) {
        const translated = texts
          .slice(offset, offset + entry.parts.length)
          .map((text, index) => `${entry.parts[index].match(/^\s*/)?.[0] || ''}${text.trim()}${entry.parts[index].match(/\s*$/)?.[0] || ''}`)
          .join('');
        offset += entry.parts.length;
        if (entry.node.isConnected && entry.node.data === entry.original) {
          records.set(entry.node, { original: entry.original, translated });
          entry.node.data = translated;
        }
      }
      watch();
      showStatus(pending.size || tasks.size ? 'Translating…' : 'Translated');
    } catch (error) {
      if (current === epoch) {
        active = false;
        observer.disconnect();
        pending.clear();
        showStatus(
          `Error: ${error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Translation could not complete.'}`,
        );
      }
    } finally {
      if (current === epoch) {
        busy = false;
        if (pending.size)
          timer = setTimeout(() => {
            void flush();
          }, 100);
      }
    }
  }
  const translate = () => {
    restore();
    if (sourceCode === settings.target || !document.body) return;
    active = true;
    showStatus('Translating…');
    collect(document.body);
    watch();
  };
  const listener = (_event: unknown, action: string, target?: string) => {
    if (disposed) return;
    if (target) settings.target = target;
    if (action === 'target') return;
    if (action === 'restore') restore();
    else
      void ready.then(() => {
        if (!disposed) translate();
      });
  };
  bridge.on('page-translation-action', listener);
  const ready = bridge
    .invoke('page-translation', { action: 'settings' })
    .then(async (value) => {
      if (document.readyState === 'loading')
        await new Promise<void>((resolve) =>
          document.addEventListener('DOMContentLoaded', () => resolve(), {
            once: true,
          }),
        );
      if (disposed) return;
      settings = value;
      sourceCode =
        document.documentElement.lang.split('-')[0].toLowerCase() || 'auto';
      if (sourceCode === 'auto' && document.body) {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let text = '',
          node: Text | null,
          count = 0;
        const end = performance.now() + 8;
        while (
          text.length < 4000 &&
          count++ < 200 &&
          performance.now() < end &&
          (node = walker.nextNode() as Text | null)
        ) {
          if (eligible(node) && node.parentElement!.getClientRects().length)
            text += node.data.slice(0, 4000 - text.length) + ' ';
        }
        try {
          sourceCode =
            (await bridge.invoke('page-translation', {
              action: 'detect',
              text: text.slice(0, 4000),
            })) || 'auto';
        } catch {
          /* Manual translation can still detect a later batch. */
        }
      }
      if (disposed) return;
      showStatus('Original page');
      if (!settings.never && settings.always[sourceCode]) {
        settings.target = settings.always[sourceCode];
        await bridge.invoke('page-translation', {action:'target', target:settings.target});
        if (!disposed) translate();
      }
    })
    .catch(() => {});
  const stop = () => {
    disposed = true;
    restore();
    bridge.removeListener?.('page-translation-action', listener);
    removeEventListener('pagehide', stop);
  };
  addEventListener('pagehide', stop, { once: true });
  return stop;
}
