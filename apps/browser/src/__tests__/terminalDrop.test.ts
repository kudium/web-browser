import { terminalDropText } from '../utils/terminalDrop';

test('pastes paths as arguments without running cd or pressing Enter', () => {
  const text = terminalDropText([
    '/Projects/Atlas Studio',
    "/Projects/sam's $(task); project",
  ]);
  expect(text).toBe(
    "'/Projects/Atlas Studio' '/Projects/sam'\"'\"'s $(task); project' "
  );
  expect(text).not.toMatch(/[\r\n]/);
});

test('escapes PowerShell apostrophes for Windows terminals', () => {
  expect(terminalDropText(["C:\\Sam's Project"], 'win32')).toBe(
    "'C:\\Sam''s Project' "
  );
});

test('rejects paths containing shell control characters and empty drops', () => {
  expect(() => terminalDropText([])).toThrow('local file');
  for (const value of [
    '/Projects/a\nb',
    '/Projects/a\rb',
    '/Projects/a\x1bb',
    '/Projects/a\0b',
  ])
    expect(() => terminalDropText([value])).toThrow('cannot be pasted safely');
});
