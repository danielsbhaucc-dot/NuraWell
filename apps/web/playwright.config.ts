import { defineConfig, devices } from '@playwright/test';

/** E2E against a deployed URL (default production) with the dedicated role=test account. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://nurawell.vercel.app',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
