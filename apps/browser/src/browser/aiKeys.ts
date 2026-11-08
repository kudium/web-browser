/* CDP encodes modifiers as a bit field. */
/* eslint-disable no-bitwise */
const named: Record<string, [string, number, string?]> = {
  // Chromium needs carriage-return text to generate keypress/default form edits.
  Enter: ['Enter', 13, '\r'],
  Tab: ['Tab', 9],
  Escape: ['Escape', 27],
  ArrowLeft: ['ArrowLeft', 37],
  ArrowUp: ['ArrowUp', 38],
  ArrowRight: ['ArrowRight', 39],
  ArrowDown: ['ArrowDown', 40],
  Home: ['Home', 36],
  End: ['End', 35],
  PageUp: ['PageUp', 33],
  PageDown: ['PageDown', 34],
  Backspace: ['Backspace', 8],
  Delete: ['Delete', 46],
  Space: ['Space', 32, ' '],
};
export function aiKey(value: unknown) {
  if (typeof value !== 'string' || value.length > 80)
    throw new Error('A valid key or chord is required.');
  const parts = value.split('+');
  const last = parts.pop()!;
  const modifierBits: Record<string, number> = {
    Alt: 1,
    Control: 2,
    Meta: 4,
    Shift: 8,
  };
  let modifiers = 0;
  parts.forEach((part) => {
    if (
      !Object.prototype.hasOwnProperty.call(modifierBits, part) ||
      modifiers & modifierBits[part]
    )
      throw new Error('Invalid or duplicate key modifier.');
    modifiers |= modifierBits[part];
  });
  const spec = Object.prototype.hasOwnProperty.call(named, last)
    ? named[last]
    : undefined;
  if (!spec && !/^[a-zA-Z0-9]$/.test(last)) throw new Error('Unsupported key.');
  const code =
    spec?.[0] ||
    (/^[0-9]$/.test(last) ? `Digit${last}` : `Key${last.toUpperCase()}`);
  let key = last;
  if (!spec) key = modifiers & 8 ? last.toUpperCase() : last.toLowerCase();
  if (last === 'Space') key = ' ';
  const text =
    modifiers & 7 ? undefined : spec?.[2] || (!spec ? key : undefined);
  return {
    key,
    code,
    windowsVirtualKeyCode: spec?.[1] || last.toUpperCase().charCodeAt(0),
    modifiers,
    ...(text ? { text, unmodifiedText: text } : {}),
  };
}
