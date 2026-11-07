import { migrationsApplied } from '@engagement-exchange/db';
import { createApp } from './app.ts';
import { configErrors, readEnv } from './core/config.ts';

const env = readEnv(process.env);
if (!env.success) {
  for (const line of configErrors(env.error)) console.error(line);
  process.exit(64);
}

const created = await createApp(env.data);
if (!created.ok) {
  console.error(created.error);
  process.exit(64);
}

const { app, api } = created.value;
const refusal = await migrationsApplied(api.database.db).then(
  (applied) =>
    applied
      ? undefined
      : 'the database schema is missing or behind: run pnpm --filter @engagement-exchange/db migrate',
  () => 'the database at DATABASE_URL is unreachable',
);
if (refusal !== undefined) {
  app.getHttpAdapter().getInstance().log.error(refusal);
  await app.close();
  process.exit(64);
}

app.enableShutdownHooks();
await app.listen({ port: env.data.API_PORT, host: env.data.API_HOST });
