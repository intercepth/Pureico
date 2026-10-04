import type { CropRect } from '../core/protocol';
import { tileLayout, traceRoundedSquare, type TileStyle } from '../core/tile';

type Source = ImageBitmap | OffscreenCanvas;

function canvas(width: number, height: number) {
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas: c, ctx };
}

/**
 * Scales a region of `source` to `width` × `height`. Large reductions are done in
 * successive halvings, which avoids the aliasing a single bilinear draw produces.
 */
export function drawScaled(
  source: Source,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  width: number,
  height: number,
): OffscreenCanvas {
  let current: Source = source;
  let [cx, cy, cw, ch] = [sx, sy, sw, sh];
  while (cw / 2 >= width && ch / 2 >= height) {
    const nw = Math.max(1, Math.round(cw / 2));
    const nh = Math.max(1, Math.round(ch / 2));
    const step = canvas(nw, nh);
    step.ctx.drawImage(current, cx, cy, cw, ch, 0, 0, nw, nh);
    [current, cx, cy, cw, ch] = [step.canvas, 0, 0, nw, nh];
  }
  const out = canvas(width, height);
  out.ctx.drawImage(current, cx, cy, cw, ch, 0, 0, width, height);
  return out.canvas;
}

/**
 * Builds the square image every icon size is derived from: either the whole image
 * centered on a transparent square, or the requested crop. Capped at `maxSide`.
 */
export function squareMaster(
  bitmap: ImageBitmap,
  crop: CropRect | null,
  maxSide: number,
): OffscreenCanvas {
  const { width: W, height: H } = bitmap;

  if (crop) {
    const cw = crop.w * W;
    const ch = crop.h * H;
    const side = Math.max(1, Math.min(cw, ch));
    const sx = clamp(crop.x * W + (cw - side) / 2, 0, W - side);
    const sy = clamp(crop.y * H + (ch - side) / 2, 0, H - side);
    const out = Math.max(1, Math.min(Math.round(side), maxSide));
    return drawScaled(bitmap, sx, sy, side, side, out, out);
  }

  const longSide = Math.max(W, H);
  const side = Math.min(longSide, maxSide);
  const scale = side / longSide;
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const fitted = drawScaled(bitmap, 0, 0, W, H, w, h);
  if (w === side && h === side) return fitted;
  const square = canvas(side, side);
  square.ctx.drawImage(fitted, Math.floor((side - w) / 2), Math.floor((side - h) / 2));
  return square.canvas;
}

/**
 * Applies a tile style to the square master: an optional fill and padding, the corner
 * shape and, for macOS, a soft shadow. Drawn at `side` px, which can be larger than the
 * master, so the corners stay crisp even when the image itself is small.
 */
export function shapeTile(
  master: OffscreenCanvas,
  style: TileStyle,
  side: number,
): OffscreenCanvas {
  const layout = tileLayout(style, side);
  const { box, radius, smoothing } = layout;
  const tile = canvas(side, side);
  const ctx = tile.ctx;
  const traceShape = () => {
    ctx.beginPath();
    traceRoundedSquare(ctx, box.x, box.y, box.size, radius, smoothing);
  };

  if (layout.fill) {
    traceShape();
    ctx.fillStyle = layout.fill;
    ctx.fill();
  }

  // Whole pixels keep the image sharp; the shape's anti-aliased edge hides the rounding.
  const x = Math.round(layout.image.x);
  const y = Math.round(layout.image.y);
  const size = Math.max(1, Math.round(layout.image.x + layout.image.size) - x);
  const image =
    size < master.width / 2
      ? drawScaled(master, 0, 0, master.width, master.height, size, size)
      : master;
  ctx.drawImage(image, 0, 0, image.width, image.height, x, y, size, size);

  // Keep only what lies inside the shape. Unlike clip(), this edge is anti-aliased everywhere.
  ctx.globalCompositeOperation = 'destination-in';
  traceShape();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  if (!layout.shadow) return tile.canvas;
  const out = canvas(side, side);
  out.ctx.shadowColor = layout.shadow.color;
  out.ctx.shadowBlur = layout.shadow.blur;
  out.ctx.shadowOffsetY = layout.shadow.offsetY;
  out.ctx.drawImage(tile.canvas, 0, 0);
  return out.canvas;
}

/** Successive halvings of the master, so each output size needs one final draw. */
export function mipChain(master: OffscreenCanvas, smallest: number): OffscreenCanvas[] {
  const chain = [master];
  let last = master;
  while (last.width / 2 >= smallest) {
    const side = Math.max(1, Math.round(last.width / 2));
    const next = canvas(side, side);
    next.ctx.drawImage(last, 0, 0, last.width, last.height, 0, 0, side, side);
    chain.push(next.canvas);
    last = next.canvas;
  }
  return chain;
}

/** Renders one output size from the closest level of the chain. */
export function renderSize(chain: OffscreenCanvas[], size: number): OffscreenCanvas {
  let level = chain[0];
  for (const candidate of chain) {
    if (candidate.width >= size) level = candidate;
  }
  const out = canvas(size, size);
  out.ctx.drawImage(level, 0, 0, level.width, level.height, 0, 0, size, size);
  return out.canvas;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
