/**
 * Pixel art, one string per row. Letters pick a palette colour (see `.px-*` in
 * styles/tokens.css), dots are transparent.
 */
export const SPRITES = {
  planet: [
    '................',
    '................',
    '................',
    '......wwaa......',
    '.....wwaaaa.....',
    '....wwaaaabb....',
    '...wwaaaabbbbooy',
    '...waaaabbbbc.yy',
    '..owaaaabbbcyyy.',
    '.ooaaaabbbyyy...',
    'yo..aabyyyyc....',
    'yyyyyyyybcc.....',
    '......bbcc......',
    '................',
    '................',
    '................',
  ],
  rocket: [
    '....a....',
    '...aaa...',
    '...aaa...',
    '..wwwww..',
    '..wwbww..',
    '..wbcbw..',
    '..wwbww..',
    '..wwwww..',
    '..wwwww..',
    '.awwwwwa.',
    'aawwwwwaa',
    'aa.sss.aa',
    'a.......a',
  ],
  flameA: ['...yyy...', '...oyo...', '....o....', '.........'],
  flameB: ['...yoy...', '..oyyyo..', '...oyo...', '....o....'],
  sparkle: ['...y...', '...y...', '..yyy..', 'yyyyyyy', '..yyy..', '...y...', '...y...'],
  star: ['..y..', '..y..', 'yyyyy', '..y..', '..y..'],
  heart: [
    '.aa...aa.',
    'awaa.aaaa',
    'aaaaaaaaa',
    'aaaaaaaaa',
    '.aaaaaaa.',
    '..aaaaa..',
    '...aaa...',
    '....a....',
  ],
  shield: [
    '.aaaaaaaaa.',
    'accccccccca',
    'accccycccca',
    'acccyyyccca',
    'acyyyyyyyca',
    'accyyyyycca',
    'accyycyycca',
    'acycccccyca',
    '.accccccca.',
    '..accccca..',
    '...accca...',
    '....aca....',
    '.....a.....',
  ],
  sun: [
    '.....y.....',
    '.y.......y.',
    '...........',
    '....yyy....',
    '...yyyyy...',
    'y..yyyyy..y',
    '...yyyyy...',
    '....yyy....',
    '...........',
    '.y.......y.',
    '.....y.....',
  ],
  moon: [
    '...abb.....',
    '..abb......',
    '.aab.......',
    'aaab.......',
    'aaab.......',
    'aaab.......',
    'aaabb......',
    'aaaabb...bb',
    '.aaaabbbbb.',
    '..aaaaaaa..',
    '...aaaaa...',
  ],
  warn: [
    '....bbbb....',
    '..bbbbbbbb..',
    '.bbbbiibbbb.',
    '.bbbbiibbbb.',
    'bbbbbiibbbbb',
    'bbbbbiibbbbb',
    'bbbbbiibbbbb',
    'bbbbbbbbbbbb',
    '.bbbbiibbbb.',
    '.bbbbiibbbb.',
    '..bbbbbbbb..',
    '....bbbb....',
  ],
  check: ['......a', '.....aa', 'a...aa.', 'aa.aa..', '.aaa...', '..a....'],
  download: [
    '..aaa..',
    '..aaa..',
    '..aaa..',
    'aaaaaaa',
    '.aaaaa.',
    '..aaa..',
    '...a...',
    '.......',
    'aaaaaaa',
  ],
  cup: [
    '................',
    '.....s...s......',
    '....s...s.......',
    '.....s...s......',
    '....s...s.......',
    '................',
    '.aaaaaaaaaaa....',
    '.accccccccca....',
    '.bbbbbbbbbbbbb..',
    '.bbbbbybbbbb.b..',
    '.bbbbyyybbbb.b..',
    '.bbbbbybbbbbbb..',
    '.bbbbbbbbbbb....',
    '..bbbbbbbbb.....',
    '.aaaaaaaaaaaaa..',
    '................',
  ],
} as const satisfies Record<string, readonly string[]>;

export type SpriteName = keyof typeof SPRITES;

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Layer {
  rows: readonly string[];
  x?: number;
  y?: number;
  className?: string;
}

/** Converts rows of palette letters into one SVG path per colour. */
function layerPaths(layer: Layer): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');
  if (layer.className) group.setAttribute('class', layer.className);
  const byColor = new Map<string, string[]>();
  layer.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === color) run++;
      if (color !== '.') {
        const d = byColor.get(color) ?? [];
        d.push(`M${x + (layer.x ?? 0)} ${y + (layer.y ?? 0)}h${run}v1h-${run}z`);
        byColor.set(color, d);
      }
      x += run;
    }
  });
  for (const [color, parts] of byColor) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `px-${color}`);
    path.setAttribute('d', parts.join(''));
    group.append(path);
  }
  return group;
}

export function pixelSvg(width: number, height: number, layers: Layer[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('sprite');
  for (const layer of layers) svg.append(layerPaths(layer));
  return svg;
}

export function sprite(name: SpriteName): SVGSVGElement {
  if (name === 'rocket') return rocket();
  const rows = SPRITES[name];
  return pixelSvg(rows[0].length, rows.length, [{ rows }]);
}

function rocket(): SVGSVGElement {
  const body = SPRITES.rocket;
  return pixelSvg(body[0].length, body.length + 4, [
    { rows: body },
    { rows: SPRITES.flameA, y: body.length, className: 'flame flame-a' },
    { rows: SPRITES.flameB, y: body.length, className: 'flame flame-b' },
  ]);
}

/** Fills every `[data-sprite]` placeholder in the document. */
export function hydrateSprites(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-sprite]').forEach((el) => {
    const name = el.dataset.sprite as SpriteName;
    if (name in SPRITES && !el.firstElementChild) el.append(sprite(name));
  });
}
