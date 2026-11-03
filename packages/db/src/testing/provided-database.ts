import { inject } from 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string | null;
  }
}

export const providedDatabaseUrl = (): string | null => inject('databaseUrl');
