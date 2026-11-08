import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
export function connect(url: string) {
  const client = postgres(url, { max: 10 });
  return { db: drizzle(client, { schema }), client };
}
export type Database = ReturnType<typeof connect>['db'];
