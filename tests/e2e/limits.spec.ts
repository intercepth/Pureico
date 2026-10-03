import { expect, file, png, pngHeader, test, upload } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('explains rejected files inline instead of using browser alerts', async ({ page }) => {
  const big = Buffer.alloc(6 * 1024 * 1024);
  pngHeader(100, 100).copy(big);

  await upload(page, [
    file('notes.txt', 'text/plain', Buffer.from('hello')),
    file('anim.gif', 'image/gif', Buffer.from('GIF89a\x01\x00\x01\x00')),
    file('big.png', 'image/png', big),
    file('panorama.png', 'image/png', pngHeader(9000, 100)),
  ]);

  const alerts = page.locator('.messages[data-region="input"] [role="alert"]');
  const texts = alerts.locator('.msg-text');
  await expect(alerts).toHaveCount(4);
  await expect(texts.nth(0)).toHaveText(
    "“notes.txt” isn't a supported image. Pureico accepts PNG, JPG, SVG and WebP.",
  );
  await expect(texts.nth(1)).toHaveText(
    '“anim.gif” is a GIF file. Pureico accepts PNG, JPG, SVG and WebP.',
  );
  await expect(texts.nth(2)).toHaveText('“big.png” is 6 MB. The limit is 5 MB per file.');
  await expect(texts.nth(3)).toHaveText(
    '“panorama.png” is 9000 × 100 px. The limit is 8192 px per side.',
  );
  await expect(page.locator('.file')).toHaveCount(0);

  await alerts.nth(0).getByRole('button', { name: 'Dismiss message' }).click();
  await expect(alerts).toHaveCount(3);
});

test('accepts at most 20 images at once', async ({ page }) => {
  const image = await png(page, 'dot.png', 8, 8, 'square-star');
  const files = Array.from({ length: 22 }, (_, i) => ({ ...image, name: `dot-${i}.png` }));
  await upload(page, files);

  await expect(page.locator('.messages[data-region="input"] [role="status"] .msg-text')).toHaveText(
    'Pureico converts up to 20 images at a time, so 2 files were skipped.',
  );
  await expect(page.locator('.file')).toHaveCount(20);
});

test('asks for at least one output', async ({ page }) => {
  await upload(page, [await png(page, 'dot.png', 32, 32, 'square-star')]);
  await page.locator('label.toggle-row', { has: page.locator('input[value="ico"]') }).click();
  await expect(page.locator('.download-text')).toHaveText('Pick at least one format above.');
  await expect(page.locator('.download-actions button')).toHaveCount(0);
});
