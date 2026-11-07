import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, request, test } from '@playwright/test';
import { webOrigin } from './origins';
import { screens } from './screens';
import { signInAs, type Role } from './session';

const lhci = createRequire(import.meta.url).resolve('@lhci/cli/src/cli.js');
const resultsDir = '.lighthouseci';
const rcDir = 'test-results/lighthouse';
const base = JSON.parse(readFileSync('lighthouserc.json', 'utf8')) as {
  readonly ci: { readonly collect: object };
};

const lighthouse = (...args: string[]) => {
  execFileSync(process.execPath, [lhci, ...args], { stdio: 'inherit', timeout: 600_000 });
};

const audit = (name: string, urls: string[], cookie?: string) => {
  const rc = `${rcDir}/${name}.json`;
  writeFileSync(
    rc,
    JSON.stringify({
      ci: {
        collect: {
          ...base.ci.collect,
          url: urls,
          chromePath: chromium.executablePath(),
          ...(cookie !== undefined && { settings: { extraHeaders: { Cookie: cookie } } }),
        },
      },
    }),
  );
  lighthouse('collect', `--config=${rc}`, '--additive');
};

interface Report {
  readonly finalDisplayedUrl: string;
  readonly audits: Record<string, { readonly numericValue: number }>;
}

test('meets LCP, CLS and TBT on every screen of the production build', async () => {
  test.setTimeout(900_000);
  rmSync(resultsDir, { recursive: true, force: true });
  mkdirSync(rcDir, { recursive: true });

  audit(
    'public',
    screens
      .filter((screen) => screen.as === undefined && screen.status === undefined)
      .map((screen) => `${webOrigin}${screen.path}`),
  );
  for (const role of ['user', 'admin'] as const satisfies readonly Role[]) {
    const session = await request.newContext({ baseURL: webOrigin });
    await signInAs(session, role);
    const cookie = (await session.storageState()).cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    await session.dispose();
    audit(
      role,
      screens.filter((screen) => screen.as === role).map((screen) => `${webOrigin}${screen.path}`),
      cookie,
    );
  }

  for (const file of readdirSync(resultsDir).filter(
    (entry) => entry.startsWith('lhr-') && entry.endsWith('.json'),
  )) {
    const report = JSON.parse(readFileSync(`${resultsDir}/${file}`, 'utf8')) as Report;
    const metric = (id: string) => report.audits[id]?.numericValue ?? Number.NaN;
    console.info(
      `${report.finalDisplayedUrl}: LCP ${metric('largest-contentful-paint').toFixed(0)} ms, CLS ${metric('cumulative-layout-shift').toFixed(3)}, TBT ${metric('total-blocking-time').toFixed(0)} ms`,
    );
  }
  lighthouse('assert', '--config=lighthouserc.json');
});
