import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const viewports = [
  { width: 360, height: 780 },
  { width: 1280, height: 800 },
] as const;

const themes = ['light', 'dark'] as const;

export const audit = async (page: Page, name: string): Promise<void> => {
  for (const theme of themes) {
    for (const viewport of viewports) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: `e2e/screenshots/${name}-${viewport.width}-${theme}.png`,
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
};
