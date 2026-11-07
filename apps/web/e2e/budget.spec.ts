import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { screens } from './screens';
import { signInAs } from './session';

const budgetBytes = 150 * 1024;

for (const screen of screens) {
  test(`${screen.name} loads at most 150 KB of gzipped JavaScript`, async ({ page }, testInfo) => {
    if (screen.as !== undefined) await signInAs(page.request, screen.as);
    const sizes: Promise<number>[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script') {
        sizes.push(response.body().then((body) => gzipSync(body).length));
      }
    });

    await page.goto(screen.path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
    const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);

    const kilobytes = (bytes / 1024).toFixed(1);
    testInfo.annotations.push({
      type: 'first-load JS',
      description: `${kilobytes} KB gzip in ${sizes.length} scripts`,
    });
    console.info(`${screen.name}: ${kilobytes} KB gzip in ${sizes.length} scripts`);
    expect(bytes).toBeLessThanOrEqual(budgetBytes);
  });
}
