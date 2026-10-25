import { defineConfig } from '@playwright/test';

/**
 * Visual regression baselines (DESIGN_SYSTEM.md §5). Public screens + the landing page as the
 * canonical reference, mobile 390 and desktop. Runs against PLAYWRIGHT_BASE_URL (default prod) so
 * it needs no build — cheap on Actions minutes. Update: `npm run test:visual -- --update-snapshots`.
 */
export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' } },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://nurawell.vercel.app',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
