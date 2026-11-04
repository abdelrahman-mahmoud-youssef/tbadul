import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Database } from './client.ts';

export const authUserEmailIndex = 'auth_users_email_lower_unique';

export const authOptions = (db: Database) =>
  ({
    database: drizzleAdapter(db, { provider: 'pg' }),
    telemetry: { enabled: false },
    advanced: { database: { generateId: 'uuid' } },
    user: { modelName: 'auth_users' },
    session: { modelName: 'auth_sessions' },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'auth_verifications' },
  }) satisfies BetterAuthOptions;
