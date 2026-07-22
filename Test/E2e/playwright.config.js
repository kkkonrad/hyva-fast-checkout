import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.js$/,
  // Checkout scenarios share one Magento quote/session and some place real orders.
  // Serial workers keep those stateful flows deterministic; CI can opt in to a
  // higher value only when it provisions an isolated store per worker.
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
