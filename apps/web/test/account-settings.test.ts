import { expect, test } from 'bun:test';
import { randomInt, randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { connect } from '../src/db';
import { createAuth } from '../src/auth';
import { createApp } from '../src/app';
import { authUser } from '../src/schema';
import { accountSettingsPage } from '../src/pages';

test('settings escape profile details and only offer available sign-in options', () => {
  expect(accountSettingsPage('<script>bad</script>', 'a@example.com', true, true)).toContain('&lt;script&gt;bad&lt;/script&gt;');
  const page = accountSettingsPage('Alice', 'a@example.com', false, false);
  expect(page).not.toContain('data-account-form="password"');
  expect(page).not.toContain('data-account-form="email"');
  expect(page).toContain('currently unavailable');
});

test.skipIf(!process.env.TEST_DATABASE_URL)('profile, password and email changes enforce account security', async () => {
  const { db, client } = connect(process.env.TEST_DATABASE_URL!);
  const baseURL = 'https://browser.kudium.com';
  const messages: { to: string; text: string; subject: string }[] = [];
  const auth = createAuth(db, { baseURL, secret: 'account-settings-integration-secret-12345' }, async message => { messages.push(message); });
  const app = createApp({ db, auth, assetOrigins: [] });
  const email = `settings-${randomUUID()}@example.com`, newEmail = `new-${randomUUID()}@example.com`;
  const password = 'original test password 123', newPassword = 'replacement test password 456';
  let id = '';
  const testIP = `198.18.${randomInt(1, 254)}.${randomInt(1, 254)}`;
  const call = (path: string, body?: unknown, cookie?: string) => app.request(path.startsWith('https:') ? path : baseURL + path, { method: body ? 'POST' : 'GET', headers: { Origin: baseURL, 'x-forwarded-for': testIP, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const link = (message: { text: string }) => message.text.split('\n').find(line => line.startsWith('https://'))!;
  const login = async () => { const response = await call('/api/auth/sign-in/email', { email, password }); expect(response.status).toBe(200); return response.headers.get('set-cookie')!.split(';')[0]; };
  try {
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
    expect((await call('/account/settings')).status).toBe(302);
    expect((await call('/api/auth/update-user', { name: 'Intruder' })).status).toBe(401);
    id = (await (await call('/api/auth/sign-up/email', { name: 'Alice', email, password })).json()).user.id;
    await call(link(messages.find(message => message.subject.includes('Verify'))!));
    const cookie = await login(), otherCookie = await login();
    const page = await call('/account/settings', undefined, cookie);
    expect(page.status).toBe(200); expect(page.headers.get('cache-control')).toBe('no-store');
    expect((await call('/api/auth/update-user', { name: 'Updated Alice' }, cookie)).status).toBe(200);
    expect(await (await call('/account/settings', undefined, cookie)).text()).toContain('Updated Alice');
    expect((await call('/api/auth/change-password', { currentPassword: 'wrong password', newPassword }, cookie)).status).toBe(400);
    expect((await call('/api/auth/change-password', { currentPassword: password, newPassword, revokeOtherSessions: true }, cookie)).status).toBe(200);
    expect((await call('/account/settings', undefined, otherCookie)).status).toBe(302);
    expect((await call('/api/auth/sign-in/email', { email, password })).status).toBe(401);
    const signed = await call('/api/auth/sign-in/email', { email, password: newPassword });
    expect(signed.status).toBe(200);
    const current = signed.headers.get('set-cookie')!.split(';')[0];
    expect((await call('/api/auth/change-email', { newEmail, callbackURL: baseURL + '/account/settings' }, current)).status).toBe(200);
    const userEmail = async () => (await db.select().from(authUser).where(eq(authUser.id, id)))[0].email;
    expect(await userEmail()).toBe(email);
    const confirmation = messages.find(message => message.subject.includes('email change'))!;
    expect(confirmation.to).toBe(email); await call(link(confirmation));
    const verification = messages.find(message => message.to === newEmail)!;
    expect(verification).toBeTruthy(); expect(await userEmail()).toBe(email);
    await call(link(verification)); expect(await userEmail()).toBe(newEmail);
  } finally { if (id) await db.delete(authUser).where(eq(authUser.id, id)); await client.end(); }
});
