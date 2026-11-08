/** Application-scoped physical key bindings; Mod means Command on macOS. */
export const shortcutActions = [
  { id: 'new-window', title: 'New browser window', keys: ['Mod+KeyN'] },
  { id: 'extensions', title: 'Open extensions menu', keys: [] },
  { id: 'history', title: 'Browsing history', keys: ['Mod+KeyY'] },
  {
    id: 'downloads',
    title: 'Download history',
    keys: ['Mod+KeyJ', 'Mod+Shift+KeyJ'],
  },
  {
    id: 'command',
    title: 'Address bar / new tab',
    keys: ['Mod+KeyL', 'Mod+KeyT'],
  },
  {
    id: 'back',
    title: 'Go back',
    keys: ['Mod+BracketLeft', 'Mod+Shift+BracketLeft'],
  },
  {
    id: 'forward',
    title: 'Go forward',
    keys: ['Mod+BracketRight', 'Mod+Shift+BracketRight'],
  },
  { id: 'reload', title: 'Reload page', keys: ['Mod+KeyR'] },
  {
    id: 'reload-ignore-cache',
    title: 'Refresh (Ignore Cache)',
    keys: ['Mod+Shift+KeyR'],
  },
  { id: 'print', title: 'Print page', keys: ['Mod+KeyP'] },
  { id: 'find', title: 'Find in page', keys: ['Mod+KeyF'] },
  { id: 'close-tab', title: 'Close tab', keys: ['Mod+KeyW'] },
  { id: 'reopen-tab', title: 'Reopen closed tab', keys: ['Mod+Shift+KeyT'] },
  { id: 'next-tab', title: 'Next tab', keys: ['Control+Tab'] },
  { id: 'previous-tab', title: 'Previous tab', keys: ['Control+Shift+Tab'] },
  { id: 'sidebar', title: 'Toggle sidebar', keys: ['Mod+Shift+KeyS'] },
  { id: 'next-space', title: 'Next space', keys: ['Mod+Alt+Shift+ArrowRight'] },
  {
    id: 'previous-space',
    title: 'Previous space',
    keys: ['Mod+Alt+Shift+ArrowLeft'],
  },
  { id: 'preferences', title: 'Open preferences', keys: ['Mod+Comma'] },
  { id: 'zoom-in', title: 'Zoom in', keys: ['Mod+Equal', 'Mod+Shift+Equal'] },
  { id: 'zoom-out', title: 'Zoom out', keys: ['Mod+Minus'] },
  { id: 'zoom-reset', title: 'Reset zoom', keys: ['Mod+Digit0'] },
] as const;
export type ShortcutAction = (typeof shortcutActions)[number]['id'];
export type ShortcutBindings = Record<ShortcutAction, string[]>;
export const defaultShortcuts = Object.fromEntries(
  shortcutActions.map((action) => [action.id, [...action.keys]])
) as ShortcutBindings;
const codes =
  /^(Key[A-Z]|Digit[0-9]|BracketLeft|BracketRight|Comma|Period|Slash|Backslash|Semicolon|Quote|Minus|Equal|Backquote|Tab|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown|F(?:[1-9]|1[0-2]))$/;
function canonical(binding: string, mac: boolean) {
  const modifier = mac ? 'Meta' : 'Control';
  return binding
    .split('+')
    .map((part) => (part === 'Mod' ? modifier : part))
    .sort()
    .join('+');
}
export function validateShortcuts(
  value: unknown,
  mac = true
): ShortcutBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid keyboard shortcuts');
  const result = { ...defaultShortcuts, ...value } as ShortcutBindings;
  const used = new Set<string>();
  const reserved = [
    'KeyQ',
    'KeyH',
    'KeyM',
    'KeyC',
    'KeyV',
    'KeyX',
    'KeyA',
    'KeyZ',
  ].flatMap((code) => [`Mod+${code}`, `Mod+Shift+${code}`]);
  reserved.push('Mod+Shift+KeyW');
  if (mac) reserved.push('Mod+Control+KeyF');
  else reserved.push('Alt+F4');
  Object.entries(result).forEach(([id, bindings]) => {
    if (
      !shortcutActions.some((action) => action.id === id) ||
      !Array.isArray(bindings) ||
      bindings.length > 4
    )
      throw new Error('Invalid keyboard shortcuts');
    bindings.forEach((binding) => {
      if (typeof binding !== 'string') throw new Error('Invalid key binding');
      const parts = binding.split('+');
      if (
        !codes.test(parts.at(-1) || '') ||
        parts.length < 2 ||
        !parts
          .slice(0, -1)
          .every((part) =>
            ['Mod', 'Control', 'Meta', 'Alt', 'Shift'].includes(part)
          ) ||
        new Set(parts).size !== parts.length ||
        !parts.some((part) => ['Mod', 'Control', 'Meta', 'Alt'].includes(part))
      )
        throw new Error('Use Command, Control or Alt with a key');
      const key = canonical(binding, mac);
      if (new Set(key.split('+')).size !== parts.length)
        throw new Error('Duplicate modifier keys');
      if (reserved.some((item) => canonical(item, mac) === key))
        throw new Error(
          'This shortcut is reserved for editing or system controls'
        );
      if (used.has(key)) throw new Error('This shortcut is already assigned');
      used.add(key);
    });
  });
  return result;
}
export interface ShortcutInput {
  code?: string;
  key: string;
  meta?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
}
export function bindingFromInput(
  input: ShortcutInput,
  mac: boolean
): string | undefined {
  const aliases: Record<string, string> = {
    '[': 'BracketLeft',
    '{': 'BracketLeft',
    ']': 'BracketRight',
    '}': 'BracketRight',
    ',': 'Comma',
    '+': 'Equal',
    '=': 'Equal',
    '-': 'Minus',
  };
  let code = input.code || aliases[input.key] || input.key;
  if (!input.code && /^[a-z]$/i.test(input.key))
    code = `Key${input.key.toUpperCase()}`;
  if (!input.code && /^\d$/.test(input.key)) code = `Digit${input.key}`;
  if (!codes.test(code)) return undefined;
  const meta = mac ? 'Mod' : 'Meta';
  const control = mac ? 'Control' : 'Mod';
  return [
    input.meta ? meta : '',
    input.control ? control : '',
    input.alt ? 'Alt' : '',
    input.shift ? 'Shift' : '',
    code,
  ]
    .filter(Boolean)
    .join('+');
}
export function matchShortcut(
  input: ShortcutInput,
  bindings: ShortcutBindings,
  mac: boolean
): ShortcutAction | undefined {
  const binding = bindingFromInput(input, mac);
  if (!binding) return undefined;
  return shortcutActions.find((action) =>
    bindings[action.id].some(
      (key) => canonical(key, mac) === canonical(binding, mac)
    )
  )?.id;
}
export function displayBinding(binding: string, mac: boolean) {
  return binding
    .split('+')
    .map(
      (part) =>
        ({
          Mod: mac ? '⌘' : 'Ctrl',
          Meta: '⌘',
          Control: 'Ctrl',
          Alt: mac ? '⌥' : 'Alt',
          Shift: 'Shift',
          BracketLeft: '[',
          BracketRight: ']',
          Comma: ',',
          Equal: '=',
          Minus: '−',
        }[part] || part.replace(/^Key|^Digit/, ''))
    )
    .join(' + ');
}

/** Convert the same saved binding to Electron's native menu syntax. */
export function menuAccelerator(binding?: string): string | undefined {
  if (!binding) return undefined;
  const names: Record<string, string> = {
    Mod: 'CommandOrControl',
    Meta: 'Command',
    Control: 'Control',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
  };
  return binding
    .split('+')
    .map((part) => names[part] || part.replace(/^Key|^Digit/, ''))
    .join('+');
}

/** Versioned portable format; Mod follows the receiving computer's platform. */
export function exportShortcuts(
  bindings: ShortcutBindings,
  mac = true
): string {
  return JSON.stringify(
    {
      format: 'kudiumbrowser-shortcuts',
      version: 1,
      bindings: validateShortcuts(bindings, mac),
    },
    null,
    2
  );
}

export function importShortcuts(source: string, mac = true): ShortcutBindings {
  if (source.length > 65536) throw new Error('Shortcut file is too large');
  let document;
  try {
    document = JSON.parse(source);
  } catch {
    throw new Error('Choose a valid Kudium Browser shortcuts JSON file');
  }
  if (
    !document ||
    document.format !== 'kudiumbrowser-shortcuts' ||
    document.version !== 1 ||
    !document.bindings ||
    typeof document.bindings !== 'object' ||
    Array.isArray(document.bindings)
  )
    throw new Error('Unsupported Kudium Browser shortcut file');
  // Require a full snapshot so a truncated file cannot silently restore defaults.
  if (
    !shortcutActions.every((action) =>
      Object.prototype.hasOwnProperty.call(document.bindings, action.id)
    )
  )
    throw new Error('Shortcut file is missing actions');
  return validateShortcuts(document.bindings, mac);
}
