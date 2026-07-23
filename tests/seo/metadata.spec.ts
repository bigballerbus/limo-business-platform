import { test, expect } from '@playwright/test';

/**
 * SEO regression suite (spec §16.5). Grows per template as pages land. For now
 * it asserts the invariants every indexable page must satisfy: exactly one H1,
 * a sensible <title>, a meta description, and the correct language.
 */
test('homepage exposes core SEO metadata', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toHaveCount(1);

  const title = await page.title();
  expect(title.length).toBeGreaterThan(10);
  expect(title.length).toBeLessThanOrEqual(70);

  const description = await page.locator('head meta[name="description"]').getAttribute('content');
  expect(description?.length ?? 0).toBeGreaterThan(50);

  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
});
