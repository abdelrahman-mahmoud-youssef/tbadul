import { betterAuth } from 'better-auth';
import { drizzle } from 'drizzle-orm/node-postgres';
import { authOptions } from './src/auth-options.ts';
import * as schema from './src/schema/index.ts';

export const auth = betterAuth(authOptions(drizzle.mock({ schema })));
