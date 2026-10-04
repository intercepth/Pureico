import { decodeBmpEntry, parseIcns, parseIco } from '../support/formats';
import { download, expect, png, pngPixels, test, unzip, upload, waitForDownloads } from './helpers';

type Rgba = ArrayLike<number>;

const PURPLE = [124, 58, 237];
const YELLOW = [252, 211, 77];
const GREEN = [16, 185, 129];

function expectColor(pixel: Rgba, color: number[]) {
  color.forEach((channel, i) => expect(Math.abs(pixel[i] - channel)).toBeLessThanOrEqual(3));
  expect(pixel[3]).toBe(255);
}

/** RGBA of one pixel in a decoded .ico bitmap entry. */
function at(entry: ReturnType<typeof decodeBmpEntry>, x: number, y: number): Rgba {
  const offset = (y * entry.width + x) * 4;
  return entry.rgba.subarray(offset, offset + 4);
}

async function icoEntry(page: import('@playwright/test').Page, size: number) {
  const entries = parseIco((await download(page, 'Download icon.ico')).bytes);
  return decodeBmpEntry(entries.find((e) => e.width === size)!.data);
}

const corners = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-corners="${name}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('rounds the corners of a square image, up to a circle', async ({ page }) => {
  await upload(page, [await png(page, 'square.png', 256, 256, 'wide-bar')]);
  await waitForDownloads(page);
  await expect(page.locator('.shape-note')).toHaveText(
    'Already square, so there’s nothing to crop.',
  );
  await expect(corners(page, 'square')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.tile-note')).toHaveText('Keeps the image’s own corners.');
  await expect(page.locator('#radius-input')).toBeHidden();

  await corners(page, 'rounded').click();
  await expect(page.locator('#radius-input')).toHaveValue('22');
  await expect(page.locator('[data-slider="radius"] .tile-value')).toHaveText('22%');
  await waitForDownloads(page);

  let icon = await icoEntry(page, 48);
  expect(at(icon, 0, 0)[3]).toBe(0);
  expect(icon.masked(0, 0)).toBe(true);
  expect(at(icon, 1, 1)[3]).toBe(0);
  expectColor(at(icon, 24, 0), PURPLE); // the straight edge between the corners stays
  expectColor(at(icon, 24, 24), PURPLE);
  await expect(page.locator('.tile-image')).toHaveAttribute('src', /^blob:/);

  await page.locator('#radius-input').fill('50');
  await expect(page.locator('#radius-input')).toHaveAttribute('aria-valuetext', '50%');
  await waitForDownloads(page);
  icon = await icoEntry(page, 48);
  expect(at(icon, 4, 4)[3]).toBe(0);
  expectColor(at(icon, 24, 1), PURPLE);
  expectColor(at(icon, 1, 24), PURPLE);
});

test("macOS style follows Apple's icon grid with a margin and a soft shadow", async ({ page }) => {
  await upload(page, [await png(page, 'app.png', 1024, 1024, 'wide-bar')]);
  await page.locator('label.toggle-row', { has: page.locator('input[value="icns"]') }).click();
  await corners(page, 'macos').click();
  await expect(page.locator('.tile-note')).toContainText('Apple’s app icon shape');
  await waitForDownloads(page);

  const icns = parseIcns((await download(page, 'Download icon.icns')).bytes);
  const ic10 = icns.chunks.find((c) => c.type === 'ic10')!.data;
  const [center, top, left, corner, above, below] = await pngPixels(page, ic10, [
    [512, 512],
    [512, 60],
    [40, 512],
    [130, 130],
    [512, 94],
    [512, 930],
  ]);
  expectColor(center, PURPLE);
  expect(top[3]).toBe(0); // 100 px margin around the 824 px shape
  expect(left[3]).toBe(0);
  expect(corner[3]).toBeLessThan(10); // outside the rounded corner
  // The shadow falls below the shape, not above it.
  expect(below[3]).toBeGreaterThan(15);
  expect(below[3]).toBeLessThan(120);
  expect(below[3]).toBeGreaterThan(above[3] * 3);
  expect(Math.max(below[0], below[1], below[2])).toBeLessThan(40);
});

test('puts a transparent logo on a padded background tile', async ({ page }) => {
  await upload(page, [await png(page, 'logo.png', 256, 256, 'square-star')]);
  await waitForDownloads(page);
  await expect(page.locator('#padding-input')).toBeHidden();

  await page.locator('.tile-color').fill('#10b981');
  await expect(page.getByRole('switch', { name: 'Background' })).toBeChecked();
  await expect(page.locator('#padding-input')).toHaveValue('12');
  await waitForDownloads(page);

  let icon = await icoEntry(page, 48);
  expectColor(at(icon, 0, 0), GREEN); // square corners, filled
  expectColor(at(icon, 24, 24), YELLOW);
  expectColor(at(icon, 24, 6), GREEN); // the logo is drawn smaller inside the tile

  await page.locator('#padding-input').fill('0');
  await waitForDownloads(page);
  icon = await icoEntry(page, 48);
  expectColor(at(icon, 24, 6), PURPLE);

  await page.locator('.tile-fill-toggle').click();
  await expect(page.locator('#padding-input')).toBeHidden();
  await waitForDownloads(page);
  icon = await icoEntry(page, 48);
  expect(at(icon, 0, 0)[3]).toBe(0);
});

test('applies one corner style to every image and keeps it for new ones', async ({ page }) => {
  const image = await png(page, 'one.png', 64, 64, 'wide-bar');
  await upload(page, [image, { ...image, name: 'two.png' }]);
  await expect(page.locator('.file')).toHaveCount(2);
  await waitForDownloads(page);

  const applyAll = page.getByRole('button', { name: 'Apply to all 2 images' });
  await expect(applyAll).toBeHidden();
  await corners(page, 'rounded').click();
  await applyAll.click();
  await expect(applyAll).toBeHidden();
  await waitForDownloads(page);

  const files = unzip((await download(page, 'Download all 2 (.zip)')).bytes);
  for (const path of ['one/icon.ico', 'two/icon.ico']) {
    const icon = decodeBmpEntry(parseIco(files[path])[2].data);
    expect(at(icon, 1, 1)[3], path).toBe(0);
    expectColor(at(icon, 24, 24), PURPLE);
  }

  await upload(page, [{ ...image, name: 'three.png' }]);
  await expect(page.locator('.file')).toHaveCount(3);
  await page.locator('.file-select').nth(2).click();
  await expect(corners(page, 'rounded')).toHaveAttribute('aria-checked', 'true');
});

test('the corner options work with arrow keys', async ({ page }) => {
  await upload(page, [await png(page, 'keys.png', 64, 64, 'wide-bar')]);
  await waitForDownloads(page);

  await corners(page, 'square').focus();
  await page.keyboard.press('ArrowRight');
  await expect(corners(page, 'rounded')).toHaveAttribute('aria-checked', 'true');
  await expect(corners(page, 'rounded')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(corners(page, 'macos')).toHaveAttribute('aria-checked', 'true');
  await expect(corners(page, 'macos')).toBeFocused();
});

test('counts the macOS margin when warning about small images', async ({ page }) => {
  await upload(page, [await png(page, 'medium.png', 900, 900, 'wide-bar')]);
  await page.locator('label.toggle-row', { has: page.locator('input[value="icns"]') }).click();
  await waitForDownloads(page);
  const warning = page.locator('.messages[data-region="item"] .msg', {
    hasText: 'gives 900 px to work with',
  });
  await expect(warning).toBeVisible();

  // The shape is drawn 824 px wide on the 1024 px icon, so 900 px is enough.
  await corners(page, 'macos').click();
  await expect(warning).toHaveCount(0);
});

test('explains where the corners go on a wide image', async ({ page }) => {
  await upload(page, [await png(page, 'wide.png', 300, 150, 'wide-bar')]);
  await waitForDownloads(page);
  const note = page.locator('.tile-note');
  const hint = 'This image isn’t square';

  await corners(page, 'rounded').click();
  await expect(note).toContainText(hint);
  await page.locator('[data-mode="crop"]').click();
  await expect(note).not.toContainText(hint);
  await page.locator('[data-mode="fit"]').click();
  await expect(note).toContainText(hint);
  await page.locator('.tile-fill-toggle').click();
  await expect(note).not.toContainText(hint);
});
