import { download, expect, png, test, upload, waitForDownloads } from './helpers';

test('remembers the light theme across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('switch', { name: 'Light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('switch', { name: 'Light mode' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('keeps recent conversions for the tab only', async ({ page, context }) => {
  await page.goto('/');
  await upload(page, [await png(page, 'logo.png', 128, 128, 'square-star')]);
  await waitForDownloads(page);
  await download(page, 'Download .ico');

  const recent = page.locator('.recent-item');
  await expect(recent).toHaveCount(1);
  await expect(recent.locator('.recent-name')).toHaveText('logo.ico');

  await page.reload();
  await expect(page.locator('.recent-item')).toHaveCount(1);
  const [again] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download logo.ico again' }).click(),
  ]);
  expect(again.suggestedFilename()).toBe('logo.ico');

  const otherTab = await context.newPage();
  await otherTab.goto('/');
  await expect(otherTab.locator('.recent')).toBeHidden();
});

test('never uploads anything or contacts other servers', async ({ page }) => {
  const requests: { method: string; url: string }[] = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));

  await page.goto('/');
  await upload(page, [await png(page, 'secret.png', 512, 512, 'square-star')]);
  await waitForDownloads(page);
  await download(page, 'Download .ico');

  for (const { method, url } of requests) {
    expect(method, url).toBe('GET');
    expect(url.startsWith('http://localhost:4173/') || /^(blob|data):/.test(url), url).toBe(true);
  }
});

test('links to Ko-fi without loading anything from it', async ({ page }) => {
  const kofiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('ko-fi')) kofiRequests.push(request.url());
  });
  await page.goto('/');

  const links = page.locator('a[href*="ko-fi.com"]');
  expect(await links.count()).toBeGreaterThanOrEqual(4);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', 'https://ko-fi.com/intercepth');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(page.getByRole('link', { name: /Support on Ko-fi/ }).first()).toBeVisible();
  expect(kofiRequests).toEqual([]);
});

test('previews the icon in this tab and restores the original', async ({ page }) => {
  await page.goto('/');
  await upload(page, [await png(page, 'logo.png', 64, 64, 'square-star')]);
  await waitForDownloads(page);

  const icon = page.locator('link[rel="icon"]').first();
  const original = await icon.getAttribute('href');
  await page.getByRole('button', { name: 'Try it in this tab' }).click();
  await expect(icon).toHaveAttribute('href', /^blob:/);
  await page.getByRole('button', { name: 'Restore Pureico’s icon' }).click();
  await expect(icon).toHaveAttribute('href', original!);
});

test('keeps working offline once loaded', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator('.offline-status')).toHaveAttribute('data-state', 'ready');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.offline-status')).toHaveAttribute('data-state', 'offline');

  await upload(page, [await png(page, 'offline.png', 256, 256, 'square-star')]);
  await waitForDownloads(page);
  const ico = await download(page, 'Download .ico');
  expect(ico.name).toBe('offline.ico');
  expect(ico.bytes.length).toBeGreaterThan(1000);
});
