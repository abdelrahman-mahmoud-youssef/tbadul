import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { screens } from './screens';
import { signInAs } from './session';

const viewports = [
  { width: 360, height: 780 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

const themes = ['light', 'dark'] as const;

const background = { light: 'rgb(244, 236, 221)', dark: 'rgb(15, 27, 27)' } as const;

for (const screen of screens) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      test(`${screen.name} at ${viewport.width} px in ${theme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.setViewportSize(viewport);
        if (screen.as !== undefined) await signInAs(page.request, screen.as);

        await page.goto(screen.path);
        await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
        await expect(page.locator('body')).toHaveCSS('background-color', background[theme]);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await page.evaluate(() => document.fonts.ready);

        const audit = await new AxeBuilder({ page }).analyze();
        expect(audit.violations).toEqual([]);

        await page.screenshot({
          path: `e2e/screenshots/${screen.name}-${viewport.width}-${theme}.png`,
          fullPage: true,
        });
      });
    }
  }
}
