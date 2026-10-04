import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { expect, test } from './helpers';

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

/**
 * Serves copies of the production build whose service workers differ only in their
 * version, so a test can publish "new versions" while a page is open.
 */
async function releases(names: string[]) {
  const dir = await mkdtemp(join(tmpdir(), 'pureico-releases-'));
  const sw = await readFile('dist/sw.js', 'utf8');
  const version = /const VERSION = '([^']+)'/.exec(sw)![1];
  for (const name of names) {
    await cp('dist', join(dir, name), { recursive: true });
    const script = sw.replace(
      `const VERSION = '${version}'`,
      `const VERSION = '${version}${name}'`,
    );
    await writeFile(join(dir, name, 'sw.js'), script);
  }

  let current = names[0];
  const server = createServer(async (request, response) => {
    let path = normalize(decodeURIComponent(new URL(request.url!, 'http://x').pathname));
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join(dir, current, path));
      response.writeHead(200, {
        'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));

  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    publish(name: string) {
      current = name;
    },
    cacheFor: (name: string) => `pureico-${version}${name}`,
    async close() {
      server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

type Releases = Awaited<ReturnType<typeof releases>>;
type Page = import('@playwright/test').Page;

/** The page's cache names, or `null` while it is reloading. */
const cacheNames = (page: Page) => page.evaluate(() => caches.keys()).catch(() => null);

/** Loads the first release, then publishes the second and reloads, which shows the prompt. */
async function promptForUpdate(page: Page, site: Releases) {
  await page.goto(`${site.url}/`);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  site.publish('b');
  await page.reload();
  await expect(page.locator('.toast')).toBeVisible();
}

test('Reload switches to the new version with one click', async ({ page }) => {
  const site = await releases(['a', 'b']);
  try {
    await promptForUpdate(page, site);
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect.poll(() => cacheNames(page)).toEqual([site.cacheFor('b')]);
    await expect(page.locator('.toast')).toBeHidden();
  } finally {
    await site.close();
  }
});

test('Reload picks up a version published after the prompt appeared', async ({ page }) => {
  const site = await releases(['a', 'b', 'c']);
  try {
    await promptForUpdate(page, site);
    site.publish('c');
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect.poll(() => cacheNames(page)).toEqual([site.cacheFor('c')]);
    await expect(page.locator('.toast')).toBeHidden();
  } finally {
    await site.close();
  }
});

test('Reload follows a newer version found while opening another page', async ({ page }) => {
  const site = await releases(['a', 'b', 'c']);
  try {
    await promptForUpdate(page, site);
    site.publish('c');
    await page.goto(`${site.url}/privacy/`);
    await expect(page.locator('.toast')).toBeVisible();
    // Let the newest version finish installing, which replaces the one first offered.
    await expect.poll(() => cacheNames(page)).toContain(site.cacheFor('c'));

    await page.getByRole('button', { name: 'Reload' }).click();
    await expect.poll(() => cacheNames(page)).toEqual([site.cacheFor('c')]);
    await expect(page.locator('.toast')).toBeHidden();
  } finally {
    await site.close();
  }
});
