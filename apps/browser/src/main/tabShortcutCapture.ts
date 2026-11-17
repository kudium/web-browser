import type { WebContents } from 'electron';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from './preferences';

// Consume tab navigation in the DOM rather than before-input-event. Chromium can
// suppress subsequent key-up events after a native key-down is prevented, which
// loses the Control release needed to commit a quick switch.
const world = 1060;
const remove = `if(window.kudiumTabShortcutCapture){window.removeEventListener('keydown',window.kudiumTabShortcutCapture,true);delete window.kudiumTabShortcutCapture}`;

export function captureTabShortcuts(contents: WebContents) {
  const install = () => {
    if (contents.isDestroyed()) return;
    const { shortcuts } = getBrowserPreferences();
    const bindings = [...shortcuts['next-tab'], ...shortcuts['previous-tab']]
      .map((binding) =>
        binding
          .split('+')
          .map((part) =>
            part === 'Mod'
              ? process.platform === 'darwin'
                ? 'Meta'
                : 'Control'
              : part,
          ),
      )
      .filter(
        (parts) =>
          parts.includes('Control') &&
          !parts.includes('Meta') &&
          !parts.includes('Alt'),
      );
    void contents
      .executeJavaScriptInIsolatedWorld(world, [
        {
          code: `${remove};
      window.kudiumTabShortcutCapture=event=>{
        if(!event.ctrlKey||event.metaKey||event.altKey)return;
        const bindings=${JSON.stringify(bindings)};
        if(bindings.some(parts=>parts.includes(event.code)&&parts.includes('Shift')===event.shiftKey)){
          event.preventDefault();event.stopImmediatePropagation();
        }
      };
      window.addEventListener('keydown',window.kudiumTabShortcutCapture,true);`,
        },
      ])
      .catch(() => {});
  };
  contents.on('dom-ready', install);
  const stopPreferences = onBrowserPreferencesChanged(install);
  if (contents.getURL()) install();
  return () => {
    contents.removeListener('dom-ready', install);
    stopPreferences();
    if (!contents.isDestroyed())
      void contents
        .executeJavaScriptInIsolatedWorld(world, [{ code: remove }])
        .catch(() => {});
  };
}
