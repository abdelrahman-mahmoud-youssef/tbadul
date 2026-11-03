import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  readonly db: Database;
  readonly close: () => Promise<void>;
}

export const createDatabase = (connectionString: string): DatabaseClient => {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
  });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
};
