import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, type Database } from './client.ts';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export const applyMigrations = async (connectionString: string): Promise<void> => {
  const { db, close } = createDatabase(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
};

export const migrationsApplied = async (db: Database): Promise<boolean> => {
  const latest = Math.max(...readMigrationFiles({ migrationsFolder }).map((m) => m.folderMillis));
  const table = await db.execute<{ name: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`,
  );
  if (table.rows[0]?.name == null) return false;
  const applied = await db.execute<{ last: string | null }>(
    sql`select max(created_at)::text as last from drizzle.__drizzle_migrations`,
  );
  return Number(applied.rows[0]?.last ?? 0) >= latest;
};
