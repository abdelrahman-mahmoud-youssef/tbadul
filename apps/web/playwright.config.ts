import { defineConfig, devices } from '@playwright/test';
import { webOrigin } from './e2e/origins';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webOrigin,
    locale: 'ar',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'e2e', testMatch: /screens\.spec\.ts|flows\.spec\.ts/ },
    { name: 'budget', testMatch: /budget\.spec\.ts/ },
  ],
});
