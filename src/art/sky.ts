import { seasonRange, zodiacSeason, type Constellation } from '../core/zodiac';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

/** Deterministic pseudo-random numbers, so the sky looks the same on every visit. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderStarfield(container: HTMLElement, count = 90): void {
  const random = seeded(2026);
  const svg = svgEl('svg', {
    viewBox: '0 0 1000 1000',
    preserveAspectRatio: 'xMidYMid slice',
    'shape-rendering': 'crispEdges',
    class: 'starfield',
  });
  for (let i = 0; i < count; i++) {
    const roll = random();
    const size = roll < 0.72 ? 2 : roll < 0.94 ? 3 : 4;
    const star = svgEl('rect', {
      x: Math.round(random() * 1000),
      y: Math.round(random() * 1000),
      width: size,
      height: size,
      class: random() < 0.2 ? 'star star-warm' : 'star',
    });
    if (random() < 0.28) {
      star.classList.add('twinkle');
      star.style.animationDelay = `${(random() * 6).toFixed(2)}s`;
    }
    svg.append(star);
  }
  const comet = svgEl('g', { class: 'comet' });
  for (let i = 0; i < 6; i++) {
    comet.append(
      svgEl('rect', {
        x: -i * 5,
        y: -i * 2,
        width: i === 0 ? 4 : 3,
        height: i === 0 ? 4 : 3,
        class: 'comet-trail',
        opacity: (1 - i / 6).toFixed(2),
      }),
    );
  }
  svg.append(comet);
  container.append(svg);
}

export function renderConstellation(container: HTMLElement, c: Constellation): void {
  const svg = svgEl('svg', {
    viewBox: '-4 -4 108 76',
    class: 'constellation-art',
    'aria-hidden': 'true',
  });
  for (const [a, b] of c.lines) {
    const [x1, y1] = c.stars[a];
    const [x2, y2] = c.stars[b];
    svg.append(svgEl('line', { x1, y1, x2, y2, class: 'c-line' }));
  }
  c.stars.forEach(([x, y, size], i) => {
    const s = 1 + size * 0.7;
    const star = svgEl('rect', {
      x: (x - s / 2).toFixed(2),
      y: (y - s / 2).toFixed(2),
      width: s.toFixed(2),
      height: s.toFixed(2),
      class: size === 3 ? 'c-star c-star-bright' : 'c-star',
    });
    star.style.animationDelay = `${(i * 0.37) % 3}s`;
    svg.append(star);
  });
  const label = svgEl('text', { x: 50, y: 70, class: 'c-label', 'text-anchor': 'middle' });
  label.textContent = c.sign.toUpperCase();
  svg.append(label);
  container.append(svg);
}

export function renderSeason(date = new Date()): void {
  const season = zodiacSeason(date);
  const constellation = document.querySelector<HTMLElement>('.constellation');
  if (constellation) renderConstellation(constellation, season);
  const footer = document.querySelector('.footer-season');
  if (footer) footer.textContent = `✦ Crafted under ${season.sign} season · ${seasonRange(season)}`;
}
