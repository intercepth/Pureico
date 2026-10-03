import { manifestIcons, manifestSnippet } from '../../src/core/manifest';
import { sniffImage } from '../../src/core/sniff';
import { decodeBmpEntry, parseIcns, parseIco } from '../support/formats';
import { download, expect, png, svg, test, unzip, upload, waitForDownloads } from './helpers';

const PURPLE = [124, 58, 237];

function expectPurple(rgba: Uint8Array, offset: number) {
  const pixel = [...rgba.subarray(offset, offset + 4)];
  PURPLE.forEach((channel, i) => expect(Math.abs(pixel[i] - channel)).toBeLessThanOrEqual(3));
  expect(pixel[3]).toBe(255);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('converts a PNG into a multi-size .ico, padding wide images onto a square', async ({
  page,
}) => {
  await upload(page, [await png(page, 'wide.png', 300, 150, 'wide-bar')]);
  await waitForDownloads(page);
  await expect(page.locator('.file-name')).toHaveText('wide');

  const ico = await download(page, 'Download .ico');
  expect(ico.name).toBe('wide.ico');
  const entries = parseIco(ico.bytes);
  expect(entries.map((e) => e.width)).toEqual([16, 32, 48, 256]);
  expect(entries.map((e) => e.format)).toEqual(['bmp', 'bmp', 'bmp', 'png']);

  const small = decodeBmpEntry(entries[0].data);
  expect(small.rgba[(0 * 16 + 8) * 4 + 3]).toBe(0); // transparent padding above
  expect(small.masked(8, 0)).toBe(true);
  expectPurple(small.rgba, (8 * 16 + 8) * 4); // artwork in the middle
});

test('crop mode keeps only the chosen square', async ({ page }) => {
  await upload(page, [await png(page, 'wide.png', 300, 150, 'wide-bar')]);
  await waitForDownloads(page);
  await page.locator('[data-mode="crop"]').click();
  await expect(page.locator('.crop-box')).toBeVisible();
  await waitForDownloads(page);

  const small = decodeBmpEntry(parseIco((await download(page, 'Download .ico')).bytes)[0].data);
  expectPurple(small.rgba, (0 * 16 + 8) * 4); // no padding any more
  expectPurple(small.rgba, (15 * 16 + 8) * 4);
});

test('rasterizes an SVG that only has a viewBox', async ({ page }) => {
  await upload(page, [
    svg(
      'badge.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#7c3aed"/></svg>',
    ),
  ]);
  await waitForDownloads(page);
  await expect(page.locator('.file-info')).toContainText('Vector · SVG');

  const entries = parseIco((await download(page, 'Download .ico')).bytes);
  const medium = decodeBmpEntry(entries[1].data);
  expect(medium.width).toBe(32);
  expect(medium.rgba[(0 * 32 + 16) * 4 + 3]).toBe(0);
  expectPurple(medium.rgba, (16 * 32 + 16) * 4);
});

test('bundles .ico, .icns and extension icons with a matching manifest snippet', async ({
  page,
}) => {
  await upload(page, [await png(page, 'star.png', 1024, 1024, 'square-star')]);
  await page.locator('label.toggle-row', { has: page.locator('input[value="icns"]') }).click();
  await page.locator('label.toggle-row', { has: page.locator('input[value="ext"]') }).click();
  await waitForDownloads(page);

  await expect(page.locator('.download-actions button')).toHaveCount(4);
  await expect(page.locator('.manifest-code')).toHaveText(manifestSnippet());

  const zip = await download(page, 'Download all (.zip)');
  expect(zip.name).toBe('star-icons.zip');
  const files = unzip(zip.bytes);
  expect(Object.keys(files).sort()).toEqual([
    'icons/icon-128.png',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'manifest-icons.json',
    'star.icns',
    'star.ico',
  ]);

  expect(JSON.parse(new TextDecoder().decode(files['manifest-icons.json']))).toEqual(
    manifestIcons(),
  );
  for (const size of [16, 32, 48, 128]) {
    expect(sniffImage(files[`icons/icon-${size}.png`])).toMatchObject({
      kind: 'png',
      width: size,
      height: size,
    });
  }

  const icns = parseIcns(files['star.icns']);
  expect(icns.chunks.map((c) => c.type)).toEqual([
    'is32',
    's8mk',
    'il32',
    'l8mk',
    'ic11',
    'ic12',
    'ic07',
    'ic13',
    'ic08',
    'ic14',
    'ic09',
    'ic10',
  ]);
  const ic10 = icns.chunks.find((c) => c.type === 'ic10')!.data;
  expect(sniffImage(ic10)).toMatchObject({ kind: 'png', width: 1024, height: 1024 });
});

test('batch converts several images into one zip with a folder each', async ({ page }) => {
  const image = await png(page, 'logo.png', 64, 64, 'square-star');
  await upload(page, [image, { ...image }, { ...image, name: 'mark.png' }]);
  await expect(page.locator('.file')).toHaveCount(3);
  await waitForDownloads(page);
  await expect(page.locator('.download-text')).toHaveText('All 3 images are ready.');

  const zip = await download(page, 'Download all 3 (.zip)');
  expect(zip.name).toBe('pureico-icons.zip');
  expect(Object.keys(unzip(zip.bytes)).sort()).toEqual([
    'logo-2/logo-2.ico',
    'logo/logo.ico',
    'mark/mark.ico',
  ]);
});

test('warns when the source is smaller than the largest output', async ({ page }) => {
  await upload(page, [await png(page, 'tiny.png', 64, 64, 'square-star')]);
  await waitForDownloads(page);
  await expect(page.locator('.messages[data-region="item"] .msg')).toContainText(
    'gives 64 px to work with',
  );
});
