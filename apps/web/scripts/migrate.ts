import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connect } from '../src/db';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const { db, client } = connect(process.env.DATABASE_URL);
try { await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname }); console.log('Migrations applied'); } finally { await client.end(); }
