import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

/**
 * Playwright drives three CI gates against a production build:
 *  • e2e  — user-facing behaviour
 *  • a11y — axe scan, zero violations (WCAG 2.2 AA)
 *  • seo  — metadata/schema regression (spec §16.5)
 *
 * Unit tests (Vitest) use *.test.ts; Playwright specs use *.spec.ts, so the two
 * runners never collide.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Optional escape hatch for environments that ship a preinstalled browser
    // (e.g. a sandbox with a pinned Chromium). Unset in normal dev/CI, where
    // Playwright manages its own browsers via `playwright install chromium`.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
    { name: 'a11y', testDir: './tests/a11y', use: { ...devices['Desktop Chrome'] } },
    { name: 'seo', testDir: './tests/seo', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm start -p 3000',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
