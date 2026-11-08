import { parseAISuggestions } from '../browser/aiSuggestions';

test('extracts bounded follow-ups without changing the completed reply', () => {
  expect(
    parseAISuggestions(
      'Done.\n```kudium-suggestions\n["Check mobile layout", "Check mobile layout", "Improve contrast"]\n```'
    )
  ).toEqual({
    text: 'Done.',
    suggestions: ['Check mobile layout', 'Improve contrast'],
  });
});

test.each([
  'Done.',
  '```json\n["Next"]\n```',
  '```kudium-suggestions\n["Next"]\n```\nMore text',
  '```kudium-suggestions\ninvalid\n```',
  '```kudium-suggestions\n["a","b","c","d"]\n```',
  '```kudium-suggestions\n[42]\n```',
  '```kudium-suggestions\n[" "]\n```',
  `\`\`\`kudium-suggestions\n["${'x'.repeat(161)}"]\n\`\`\``,
])('keeps ordinary or invalid reply content intact', (text) => {
  expect(parseAISuggestions(text)).toEqual({ text, suggestions: [] });
});
