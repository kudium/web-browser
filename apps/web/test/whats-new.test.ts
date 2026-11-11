import { expect, test } from 'bun:test';
import { createApp } from '../src/app';
import type { Database } from '../src/db';

test('release highlights are public and link to release history', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const response = await app.request('/whats-new');
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Version 1.0.7');
  expect(html).toContain('Activity you can trace');
  expect(html).toContain('href="/releases"');
});
