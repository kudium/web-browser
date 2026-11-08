import { aiHandoffReason } from '../browser/aiHandoff';

it('accepts a concise human action and rejects missing or oversized requests', () => {
  expect(aiHandoffReason('  Complete login  ')).toBe('Complete login');
  [undefined, '', '  ', 42, 'x'.repeat(301)].forEach((reason) => {
    expect(() => aiHandoffReason(reason)).toThrow('human action');
  });
});
