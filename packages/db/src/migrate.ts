import { z } from 'zod';
import { applyMigrations } from './migrations.ts';

const env = z.object({ DATABASE_URL: z.url() }).parse(process.env);

await applyMigrations(env.DATABASE_URL);
