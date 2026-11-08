import { expect, test } from 'bun:test';
import { completion } from './app';
test('project progress', () => { expect(completion(8, 12)).toBe(67); expect(completion(0, 0)).toBe(0); });
