import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';
import { applyMigrations } from '../migrations.ts';

export interface TestDatabase {
  readonly connectionString: string;
  readonly stop: () => Promise<void>;
}

export const dockerReachable = async (): Promise<boolean> => {
  try {
    await getContainerRuntimeClient();
    return true;
  } catch {
    return false;
  }
};

export const startTestDatabase = async (): Promise<TestDatabase> => {
  const container = await new PostgreSqlContainer('postgres:18').start();
  const stop = async () => {
    await container.stop();
  };
  const connectionString = container.getConnectionUri();
  try {
    await applyMigrations(connectionString);
  } catch (error) {
    await stop();
    throw error;
  }
  return { connectionString, stop };
};
