import { aiKey } from '../browser/aiKeys';

it('maps keys and modifier chords to Chromium fields', () => {
  expect(aiKey('Control+Shift+A')).toMatchObject({
    key: 'A',
    code: 'KeyA',
    modifiers: 10,
    windowsVirtualKeyCode: 65,
  });
  expect(aiKey('Meta+A')).toMatchObject({ key: 'a', modifiers: 4 });
  expect(aiKey('Enter')).toMatchObject({
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
    unmodifiedText: '\r',
  });
  expect(aiKey('Shift+b')).toMatchObject({ key: 'B', text: 'B', modifiers: 8 });
  expect(aiKey('Space')).toMatchObject({ key: ' ', text: ' ', code: 'Space' });
  expect(aiKey('Control+a')).not.toHaveProperty('text');
  expect(aiKey('Shift+Enter')).toMatchObject({ text: '\r', modifiers: 8 });
  ['Control+Enter', 'Alt+Enter', 'Meta+Enter'].forEach((chord) =>
    expect(aiKey(chord)).not.toHaveProperty('text')
  );
});
it('rejects malformed and unsupported input', () => {
  [
    undefined,
    '',
    'Control+Control+A',
    'Command+A',
    'Control+',
    'F200',
    'a+b',
    '+',
    'abc',
    'constructor',
    '__proto__',
    'constructor+A',
  ].forEach((key) => expect(() => aiKey(key)).toThrow());
});
