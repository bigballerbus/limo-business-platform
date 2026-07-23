import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Zero axe violations is a hard launch gate (spec §0.4). Automated axe covers
 * roughly half of WCAG 2.2 AA; a manual audit before launch covers the rest
 * (keyboard, screen-reader, focus order, reflow) — see the Definition of Done.
 *
 * The page is theme-aware, so both colour schemes are scanned — contrast must
 * hold in light and dark.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  test(`homepage has zero axe violations — ${colorScheme} (WCAG 2.2 AA)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
