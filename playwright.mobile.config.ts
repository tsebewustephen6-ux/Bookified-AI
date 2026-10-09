import { defineConfig } from '@playwright/test';
const port = Number(process.env.BOOKIFIED_MOBILE_TEST_PORT || 8083);
export default defineConfig({
  testDir: './tests/mobile',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, viewport: { width: 375, height: 812 } },
  webServer: { command: 'node scripts/mobile-preview.mjs', url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60000 },
  workers: 1,
  reporter: 'list',
});
