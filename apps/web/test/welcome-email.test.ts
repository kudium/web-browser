import { expect, test } from 'bun:test';
import { createAuth, type MailDelivery } from '../src/auth';
import type { Database } from '../src/db';
const config = { secret: 'test-secret-at-least-32-characters-long', baseURL: 'https://browser.kudium.com' };

test('new email and verified OAuth accounts receive a welcome email from the creation hook', async () => {
  const messages: Parameters<MailDelivery>[0][] = [];
  const auth = createAuth({} as Database, config, async message => { messages.push(message); });
  const after = auth.options.databaseHooks!.user!.create!.after!;
  for (const emailVerified of [false, true]) {
    await after({ id: 'new-user', name: 'Test', email: 'new@example.com', emailVerified, createdAt: new Date(), updatedAt: new Date() });
  }
  expect(messages).toHaveLength(2);
  for (const message of messages) {
    expect(message.subject).toBe('Welcome to Kudium');
    expect(message.html).toContain('Download Kudium Browser');
    expect(message.text).toContain('https://browser.kudium.com/download');
    expect(message.html).not.toContain('Verify email address');
    expect(message.html).toContain('https://github.com/sponsors/kudium');
    expect(message.text).toContain('https://github.com/sponsors/kudium');
  }
  expect(Object.keys(auth.options.databaseHooks!)).toEqual(['user']);
});

test('welcome mail failure does not reject successful account creation', async () => {
  const auth = createAuth({} as Database, config, async () => { throw new Error('delivery unavailable'); });
  await expect(auth.options.databaseHooks!.user!.create!.after!({ id: 'new-user', name: 'Test', email: 'new@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })).resolves.toBeUndefined();
});
