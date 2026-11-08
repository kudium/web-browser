import { publishingConfig } from './release-publishing';
import { connect } from './db';
import { authConfig } from './config';
import { createAuth } from './auth';
import { createApp } from './app';
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
const { db, client } = connect(required('DATABASE_URL'));
const app = createApp({ db, publishing: publishingConfig(process.env), auth: createAuth(db, authConfig(process.env)), assetOrigins: required('RELEASE_ASSET_ORIGINS').split(',').map(v => v.trim()).filter(Boolean) });
const server = Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: app.fetch, maxRequestBodySize: 12 * 1024 * 1024, idleTimeout: 60 });
console.log(`Kudium web: http://localhost:${server.port}`);
async function shutdown() { await server.stop(false); await client.end(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
