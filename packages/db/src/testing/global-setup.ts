import type { TestProject } from 'vitest/node';
import { dockerReachable, startTestDatabase } from './test-database.ts';

export const setup = async (project: TestProject): Promise<(() => Promise<void>) | undefined> => {
  if (!(await dockerReachable())) {
    console.info('Docker is unreachable: database tests are skipped.');
    project.provide('databaseUrl', null);
    return undefined;
  }
  const database = await startTestDatabase();
  project.provide('databaseUrl', database.connectionString);
  return database.stop;
};
