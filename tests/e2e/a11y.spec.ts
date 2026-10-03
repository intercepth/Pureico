import AxeBuilder from '@axe-core/playwright';
import { expect, png, test, upload, waitForDownloads } from './helpers';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ context }) => {
      if (theme === 'light') {
        await context.addInitScript(() => localStorage.setItem('pureico:theme', 'light'));
      }
    });

    test('the converter meets WCAG 2.2 AA checks', async ({ page }) => {
      await page.goto('/');
      await audit(page);

      await upload(page, [await png(page, 'logo.png', 64, 64, 'square-star')]);
      await page.locator('label.toggle-row', { has: page.locator('input[value="ext"]') }).click();
      await waitForDownloads(page);
      await page.locator('.faq-item').first().locator('summary').click();
      await audit(page);
    });

    test('the privacy and terms pages meet WCAG 2.2 AA checks', async ({ page }) => {
      for (const path of ['/privacy/', '/terms/']) {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        await audit(page);
      }
    });
  });
}
