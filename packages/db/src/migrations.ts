import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.ts';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export const applyMigrations = async (connectionString: string): Promise<void> => {
  const { db, close } = createDatabase(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
};
