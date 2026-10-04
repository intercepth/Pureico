import { expect, test } from './helpers';

const jumpToBottom = () =>
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });

const animationNames = () => document.getAnimations().map((a) => (a as CSSAnimation).animationName);

test.describe('with motion allowed', () => {
  test('plays an entrance on load and smooth-scrolls', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(animationNames)).toContain('rise');
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
  });

  test('holds sections below the fold back until they scroll into view', async ({ page }) => {
    await page.goto('/');
    const donate = page.locator('.donate');
    await expect(donate).toHaveClass(/is-waiting/);
    await expect(donate).toHaveCSS('opacity', '0');

    await donate.scrollIntoViewIfNeeded();
    await expect(donate).not.toHaveClass(/is-waiting/);
    await expect(donate).toHaveCSS('opacity', '1');
  });

  test('never leaves a section invisible after a jump past it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto('/');
    await expect(page.locator('.faq')).toHaveClass(/is-waiting/);

    // The FAQ ends up wholly above the screen without ever having been on it.
    await page.evaluate(jumpToBottom);
    await expect(page.locator('.is-waiting')).toHaveCount(0);
    await expect(page.locator('.faq')).toHaveCSS('opacity', '1');
  });

  test('the hero planet levitates and follows the pointer', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(animationNames)).toContain('levitate');

    const art = page.locator('.hero-art');
    const pointerX = () => art.evaluate((el) => Number(el.style.getPropertyValue('--px')));
    const planetShift = () =>
      page.locator('.hero-planet').evaluate((el) => getComputedStyle(el).translate);

    await page.mouse.move(1270, 300);
    await expect.poll(pointerX).toBeGreaterThan(0.9);
    await expect.poll(planetShift).not.toBe('none');
    await page.mouse.move(10, 300);
    await expect.poll(pointerX).toBeLessThan(-0.9);
  });

  test('does not widen the page while things animate in', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('the privacy panel animates shut and can be reopened mid-way', async ({ page }) => {
    await page.goto('/');
    const badge = page.locator('.privacy-badge');
    const panel = page.locator('#privacy-panel');

    await badge.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(badge).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    // Open, close and open again faster than the closing animation: it must stay open afterwards,
    // and the first close's timer must not hide it.
    await badge.click();
    await badge.click();
    await badge.click();
    await expect(badge).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(600);
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/is-leaving/);
  });

  test('switching theme twice in a row ends on the right theme and remembers it', async ({
    page,
  }) => {
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.getByRole('switch', { name: 'Light mode' });

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('with reduced motion requested', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows everything at once and plays no entrance', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(animationNames)).not.toContain('rise');
    await expect(page.locator('.is-waiting')).toHaveCount(0);
    await expect(page.locator('.donate')).toHaveCSS('opacity', '1');
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  });

  test('the hero planet holds still and ignores the pointer', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(1270, 300);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => ({
      px: document.querySelector<HTMLElement>('.hero-art')!.style.getPropertyValue('--px'),
      animations: document.getAnimations().map((a) => (a as CSSAnimation).animationName),
    }));
    expect(state.px).toBe('');
    expect(state.animations).not.toContain('levitate');
    expect(state.animations).not.toContain('hover-float');
  });

  test('keeps nothing moving on the other pages either', async ({ page }) => {
    for (const path of ['/privacy/', '/terms/', '/404.html']) {
      await page.goto(path);
      const names = await page.evaluate(animationNames);
      expect(names.filter((name) => ['rise', 'fall', 'fade-in'].includes(name))).toEqual([]);
    }
  });

  test('the privacy panel closes at once', async ({ page }) => {
    await page.goto('/');
    await page.locator('.privacy-badge').click();
    await expect(page.locator('#privacy-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#privacy-panel')).toBeHidden();
    await expect(page.locator('#privacy-panel')).not.toHaveClass(/is-leaving/);
  });
});
