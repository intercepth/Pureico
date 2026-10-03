import { pixelSvg } from './sprites';

const FRAMES = 8;
const SIZE = 10;

/** Rows for one moon phase; `phase` runs 0 (new) → 0.5 (full) → 1 (new). */
function phaseRows(phase: number): string[] {
  const rows: string[] = [];
  const r = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    let row = '';
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5 - r) / r;
      const v = (y + 0.5 - r) / r;
      if (u * u + v * v > 1) {
        row += '.';
        continue;
      }
      const edge = Math.sqrt(1 - v * v);
      const terminator = Math.cos(2 * Math.PI * phase) * edge;
      const lit = phase <= 0.5 ? u > terminator : u < -terminator;
      row += lit ? 'a' : 'c';
    }
    rows.push(row);
  }
  return rows;
}

/** A moon cycling through its phases, used as the loading indicator. */
export function moonLoader(): HTMLSpanElement {
  const layers = Array.from({ length: FRAMES }, (_, i) => ({
    rows: phaseRows((i + 1) / (FRAMES + 1)),
    x: i * SIZE,
  }));
  const svg = pixelSvg(SIZE * FRAMES, SIZE, layers);
  const holder = document.createElement('span');
  holder.className = 'moon-loader';
  holder.setAttribute('role', 'presentation');
  holder.append(svg);
  return holder;
}
