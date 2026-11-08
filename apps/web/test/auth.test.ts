import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, inArray } from 'drizzle-orm';
import { connect } from '../src/db';
import { createAuth, syncAccountId } from '../src/auth';
import { createApp } from '../src/app';
import { authUser, authSession, authAccount, accounts } from '../src/schema';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Better Auth with PostgreSQL', () => {
  const { db, client } = connect(url!);
  const baseURL = 'https://webbrowser.kudium.com';
  const auth = createAuth(db, { baseURL, secret: 'integration-test-secret-at-least-32-characters' });
  const app = createApp({ db, auth, assetOrigins: [] });
  const suffix = randomUUID();
  const email = `alice-${suffix}@example.com`, otherEmail = `bob-${suffix}@example.com`;
  const password = 'a strong test password 123';
  const ids: string[] = [];
  let token: string, rawToken: string, cookie: string, otherToken: string;
  function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return app.request(baseURL + path, { method, headers: { Origin: baseURL, 'x-forwarded-for': '192.0.2.23', ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  beforeAll(async () => { await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname }); });
  afterAll(async () => {
    if (ids.length) { await db.delete(accounts).where(inArray(accounts.id, ids.map(syncAccountId))); await db.delete(authUser).where(inArray(authUser.id, ids)); }
    await client.end();
  });
  test('registers, hashes passwords, sets private cookies and accepts signed desktop credentials', async () => {
    const signup = await request('/api/auth/sign-up/email', 'POST', { name: 'Alice <script>', email, password });
    expect(signup.status).toBe(200);
    const result = await signup.json(); ids.push(result.user.id); rawToken = result.token;
    token = signup.headers.get('set-auth-token')!; expect(token).toBeTruthy(); expect(token).not.toBe(rawToken);
    const setCookie = signup.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly'); expect(setCookie).toContain('Secure'); expect(setCookie).toContain('SameSite=Lax');
    cookie = setCookie.split(';')[0];
    const [credential] = await db.select().from(authAccount).where(eq(authAccount.userId, result.user.id));
    expect(credential.password).toBeTruthy(); expect(credential.password).not.toBe(password);
    expect((await request('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await request('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${rawToken}` })).status).toBe(401);
    expect((await request('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${token}tamper` })).status).toBe(401);
    const page = await request('/account', 'GET', undefined, { Cookie: cookie });
    expect(page.status).toBe(200); expect(page.headers.get('Cache-Control')).toBe('no-store');
    const html = await page.text(); expect(html).toContain('Alice &lt;script&gt;'); expect(html).not.toContain(token); expect(html).not.toContain(rawToken);
  });
  test('rejects bad passwords and untrusted origins; protected pages redirect', async () => {
    expect((await request('/api/auth/sign-in/email', 'POST', { email, password: 'wrong password' })).status).toBe(401);
    expect((await request('/api/auth/sign-in/email', 'POST', { email, password }, { Origin: 'https://untrusted.example' })).status).toBe(403);
    expect((await request('/account')).headers.get('Location')).toBe('/sign-in');
    expect((await request('/sign-up')).status).toBe(200);
    expect((await request('/assets/auth.js')).headers.get('Content-Type')).toContain('javascript');
  });
  test('real sessions cannot access another account’s records', async () => {
    const signup = await request('/api/auth/sign-up/email', 'POST', { name: 'Bob', email: otherEmail, password });
    expect(signup.status).toBe(200); const user = (await signup.json()).user; ids.push(user.id);
    otherToken = signup.headers.get('set-auth-token')!;
    const envelope = { version: 1, recordId: 'private_record', keyVersion: 1, nonce: Buffer.alloc(12).toString('base64'), ciphertext: Buffer.from('ciphertext').toString('base64'), tag: Buffer.alloc(16).toString('base64') };
    expect((await request('/v1/sync/records/private_record', 'PUT', envelope, { Authorization: `Bearer ${token}`, 'If-None-Match': '*' })).status).toBe(201);
    expect((await request('/v1/sync/records/private_record', 'GET', undefined, { Authorization: `Bearer ${otherToken}` })).status).toBe(404);
  });
  test('sign-out immediately revokes both browser and bearer credentials', async () => {
    expect((await request('/api/auth/sign-out', 'POST', {}, { Cookie: cookie })).status).toBe(200);
    expect((await request('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${token}` })).status).toBe(401);
    expect((await request('/account', 'GET', undefined, { Cookie: cookie })).status).toBe(302);
  });
  test('email verification and one-use password reset revoke existing sessions', async () => {
    const messages: { to: string; text: string; subject: string }[] = [];
    const mailAuth = createAuth(db, { baseURL, secret: 'mail-integration-secret-at-least-32-characters', smtpFrom: 'Kudium <hello@example.com>' }, async mail => { messages.push(mail); });
    const mailApp = createApp({ db, auth: mailAuth, assetOrigins: [] });
    const mailEmail = `verified-${suffix}@example.com`;
    const call = (path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => mailApp.request(path.startsWith('https:') ? path : baseURL + path, { method, headers: { Origin: baseURL, 'x-forwarded-for': '192.0.2.88', ...extra, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const signup = await call('/api/auth/sign-up/email', 'POST', { name: 'Verified', email: mailEmail, password });
    expect(signup.status).toBe(200); const created = await signup.json(); ids.push(created.user.id);
    expect(created.token).toBeNull(); expect(created.user.emailVerified).toBe(false);
    expect(messages[0].to).toBe(mailEmail);
    expect((await call('/api/auth/sign-in/email', 'POST', { email: mailEmail, password })).status).toBe(403);
    const verificationURL = messages[0].text.split('\n')[1];
    expect((await call(verificationURL)).status).toBe(302);
    const signin = await call('/api/auth/sign-in/email', 'POST', { email: mailEmail, password });
    expect(signin.status).toBe(200); const signed = signin.headers.get('set-auth-token')!;
    expect((await call('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${signed}` })).status).toBe(200);
    expect((await call('/api/auth/request-password-reset', 'POST', { email: mailEmail, redirectTo: baseURL + '/reset-password' })).status).toBe(200);
    const resetMail = messages.find(message => message.subject.includes('Reset'))!;
    const resetURL = resetMail.text.split('\n')[1];
    const redirect = await call(resetURL); expect(redirect.status).toBe(302);
    const resetToken = new URL(redirect.headers.get('Location')!).searchParams.get('token'); expect(resetToken).toBeTruthy();
    const resetBody = { token: resetToken, newPassword: 'my replacement password 456' };
    expect((await call('/api/auth/reset-password', 'POST', resetBody)).status).toBe(200);
    expect((await call('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${signed}` })).status).toBe(401);
    expect((await call('/api/auth/reset-password', 'POST', resetBody)).status).toBe(400);
    expect((await call('/api/auth/sign-in/email', 'POST', { email: mailEmail, password: resetBody.newPassword })).status).toBe(200);
  });
  test('expires sessions through the database instead of trusting a cached token', async () => {
    const signin = await request('/api/auth/sign-in/email', 'POST', { email, password });
    expect(signin.status).toBe(200); const result = await signin.json();
    const signed = signin.headers.get('set-auth-token')!;
    await db.update(authSession).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authSession.token, result.token));
    expect((await request('/v1/sync/status', 'GET', undefined, { Authorization: `Bearer ${signed}` })).status).toBe(401);
  });
});
