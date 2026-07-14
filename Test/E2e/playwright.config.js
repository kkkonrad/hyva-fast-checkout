import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'CheckoutTest.spec.js',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://m10625.app-on-demand.net/',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
});
