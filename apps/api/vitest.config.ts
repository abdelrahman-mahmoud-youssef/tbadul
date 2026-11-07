import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['@engagement-exchange/db/testing/global-setup'],
    fileParallelism: false,
  },
});
