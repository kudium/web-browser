// Dedicated local QA database only. Never point this fixture at production.
import { connect } from '../src/db';
import { createAuth } from '../src/auth';
import { createApp } from '../src/app';
import { authRateLimit } from '../src/schema';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
const testURL = new URL(process.env.TEST_DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(testURL.hostname) || !testURL.pathname.includes('_test')) throw new Error('Use a local database with _test in its name');
const { db, client } = connect(testURL.href);
await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
await db.delete(authRateLimit);
const baseURL = 'http://localhost:3137';
const auth = createAuth(db, { baseURL, secret: 'local-passkey-test-secret-at-least-32-characters', google: { clientId: 'fictional-test-client', clientSecret: 'fictional-test-secret' } });
const app = createApp({ db, auth, assetOrigins: [] });
const server = Bun.serve({ hostname: '127.0.0.1', port: 3137, fetch: app.fetch });
console.log('PASSKEY_TEST_READY');
process.on('SIGTERM', async () => { await server.stop(true); await client.end(); process.exit(0); });
