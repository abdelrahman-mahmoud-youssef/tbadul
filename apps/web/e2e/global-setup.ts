import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { apiOrigin, controlOrigin, webOrigin } from './origins';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const webDir = fileURLToPath(new URL('../', import.meta.url));
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

const run = (command: string, cwd: string, env: NodeJS.ProcessEnv = process.env) => {
  execSync(command, { cwd, env, stdio: 'inherit', timeout: 600_000 });
};

const ready = async (url: string, child: ChildProcess, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${url} exited with ${child.exitCode}`);
    const answered = await fetch(url, { signal: AbortSignal.timeout(2_000) }).then(
      (response) => response.ok,
      () => false,
    );
    if (answered) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer within ${timeoutMs} ms`);
};

const free = async (url: string): Promise<void> => {
  const answered = await fetch(url, { signal: AbortSignal.timeout(2_000) }).then(
    () => true,
    () => false,
  );
  if (answered) throw new Error(`${url} is already in use; stop that server first`);
};

export default async function globalSetup(): Promise<() => Promise<void>> {
  await Promise.all([free(webOrigin), free(apiOrigin), free(controlOrigin)]);
  run(
    'pnpm exec turbo run build --filter=@engagement-exchange/web --filter=@engagement-exchange/api',
    repoRoot,
    { ...process.env, API_ORIGIN: apiOrigin },
  );
  run('pnpm run build:e2e', apiDir);

  const api = spawn(process.execPath, ['dist-e2e/testing/e2e-server.js'], {
    cwd: apiDir,
    env: {
      ...process.env,
      E2E_API_PORT: new URL(apiOrigin).port,
      E2E_CONTROL_PORT: new URL(controlOrigin).port,
      E2E_WEB_ORIGIN: webOrigin,
    },
    stdio: 'inherit',
  });
  await ready(`${apiOrigin}/api/health`, api, 180_000);

  const web = spawn(process.execPath, [nextBin, 'start', '--port', new URL(webOrigin).port], {
    cwd: webDir,
    env: { ...process.env, API_ORIGIN: apiOrigin },
    stdio: 'inherit',
  });
  await ready(`${webOrigin}/`, web, 60_000);

  return async () => {
    web.kill();
    const exited = once(api, 'exit');
    await fetch(`${controlOrigin}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => api.kill());
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 30_000))]);
    if (api.exitCode === null) api.kill();
  };
}
