import { describe, expect, it } from 'vitest';
import { manifestIcons, manifestSnippet } from '../../src/core/manifest';
import { baseName, uniqueNames } from '../../src/core/names';
import { requiredSizes } from '../../src/core/sizes';
import { CONSTELLATIONS, seasonRange, zodiacSeason } from '../../src/core/zodiac';

describe('baseName', () => {
  it.each([
    ['logo.png', 'logo'],
    ['My App Icon.final.svg', 'My App Icon.final'],
    ['bad:name?*.png', 'bad-name'],
    ['  spaced   out  .jpg', 'spaced out'],
    ['.png', 'icon'],
    ['---.webp', 'icon'],
    ['CON.png', 'CON-icon'],
    ['lpt1.jpg', 'lpt1-icon'],
  ])('%s → %s', (input, expected) => {
    expect(baseName(input)).toBe(expected);
  });

  it('caps long names', () => {
    expect(baseName(`${'a'.repeat(100)}.png`)).toHaveLength(64);
  });
});

describe('uniqueNames', () => {
  it('suffixes case-insensitive duplicates', () => {
    expect(uniqueNames(['logo', 'Logo', 'logo', 'logo-2'])).toEqual([
      'logo',
      'Logo-2',
      'logo-3',
      'logo-2-2',
    ]);
  });
});

describe('manifest helper', () => {
  it('points every size at the generated PNGs', () => {
    expect(manifestIcons()).toEqual({
      icons: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
      action: { default_icon: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png' } },
    });
  });

  it('produces a fragment that is valid inside a manifest object', () => {
    const snippet = manifestSnippet();
    expect(snippet.startsWith('"icons": {')).toBe(true);
    expect(JSON.parse(`{${snippet}}`)).toEqual(manifestIcons());
  });
});

describe('requiredSizes', () => {
  it('merges the sizes of every enabled format', () => {
    expect(requiredSizes([16, 32], { ico: true, icns: false, ext: false })).toEqual([16, 32]);
    expect(requiredSizes([256], { ico: true, icns: false, ext: true })).toEqual([
      16, 32, 48, 128, 256,
    ]);
    expect(requiredSizes([48], { ico: false, icns: true, ext: false })).toEqual([
      16, 32, 64, 128, 256, 512, 1024,
    ]);
  });
});

describe('zodiacSeason', () => {
  it.each([
    [new Date(2026, 9, 3), 'Libra'],
    [new Date(2026, 9, 23), 'Scorpio'],
    [new Date(2026, 11, 21), 'Sagittarius'],
    [new Date(2026, 11, 22), 'Capricorn'],
    [new Date(2027, 0, 19), 'Capricorn'],
    [new Date(2027, 0, 20), 'Aquarius'],
    [new Date(2027, 2, 20), 'Pisces'],
    [new Date(2027, 2, 21), 'Aries'],
  ])('%s → %s', (date, sign) => {
    expect(zodiacSeason(date).sign).toBe(sign);
  });

  it('covers every day of the year exactly once', () => {
    const counts = new Map<string, number>();
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      const sign = zodiacSeason(d).sign;
      counts.set(sign, (counts.get(sign) ?? 0) + 1);
    }
    expect(counts.size).toBe(12);
    for (const days of counts.values()) expect(days).toBeGreaterThanOrEqual(28);
  });

  it('formats season ranges', () => {
    expect(seasonRange(zodiacSeason(new Date(2026, 9, 3)))).toBe('Sep 23 – Oct 22');
  });

  it('has well-formed constellation data', () => {
    for (const c of CONSTELLATIONS) {
      for (const [x, y] of c.stars) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(60);
      }
      for (const [a, b] of c.lines) {
        expect(c.stars[a]).toBeDefined();
        expect(c.stars[b]).toBeDefined();
      }
    }
  });
});
