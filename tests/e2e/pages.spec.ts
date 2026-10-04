import { expect, test } from './helpers';

test('privacy policy and terms are linked from every page', async ({ page }) => {
  for (const path of ['/', '/privacy/', '/terms/']) {
    await page.goto(path);
    const footer = page.getByRole('navigation', { name: 'Footer' });
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy/',
    );
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms/');
    await expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      'mailto:pureico.contact@intercepth.dev',
    );
    const more = footer.getByRole('link', { name: 'More by Intercepth' });
    await expect(more).toHaveAttribute('href', 'https://intercepth.dev/');
    await expect(more).toHaveAttribute('target', '_blank');
    await expect(more).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

test('legal pages have their own titles and canonical URLs', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page).toHaveTitle('Privacy Policy · Pureico');
  await expect(page.locator('h1')).toHaveText('Privacy Policy');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://pureico.intercepth.dev/privacy/',
  );

  await page.goto('/terms/');
  await expect(page).toHaveTitle('Terms of Use · Pureico');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://pureico.intercepth.dev/terms/',
  );
});

test('publishes search and security metadata', async ({ page, request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://pureico.intercepth.dev/sitemap.xml');

  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/', '/privacy/', '/terms/']) {
    expect(sitemap).toContain(`<loc>https://pureico.intercepth.dev${path}</loc>`);
  }

  const security = await (await request.get('/.well-known/security.txt')).text();
  expect(security).toContain('Contact: mailto:pureico.contact@intercepth.dev');
  const expires = new Date(security.match(/^Expires: (.+)$/m)![1]);
  expect(expires.getTime()).toBeGreaterThan(Date.now());

  await page.goto('/');
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '',
  );
  expect(jsonLd).toMatchObject({
    '@type': 'WebApplication',
    name: 'Pureico',
    creator: { name: 'Intercepth', url: 'https://intercepth.dev/' },
  });
});

test('legal pages work offline once the app is cached', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);

  await page.goto('/terms/');
  await expect(page.locator('h1')).toHaveText('Terms of Use');
  await page.goto('/privacy');
  await expect(page.locator('h1')).toHaveText('Privacy Policy');
});
