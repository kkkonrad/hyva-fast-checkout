import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'https://m10625.app-on-demand.net/',
    ignoreHTTPSErrors: true,
  },
});
