/**
 * Corner shapes and background tiles, applied to the square master image before it is
 * scaled to each icon size.
 */

export type Corners = 'square' | 'rounded' | 'macos';

export interface TileStyle {
  corners: Corners;
  /** Corner radius for `rounded`, in percent of the side. 50 makes a circle. */
  radius: number;
  /** Whether a solid color fills the shape behind the image. */
  fill: boolean;
  /** The fill color as `#rrggbb`. */
  color: string;
  /** Space between the shape's edge and the image while filled, in percent of the shape. */
  padding: number;
}

export const DEFAULT_TILE: TileStyle = {
  corners: 'square',
  radius: 22,
  fill: false,
  color: '#ffffff',
  padding: 12,
};

export const RADIUS_RANGE = { min: 2, max: 50 } as const;
export const PADDING_RANGE = { min: 0, max: 30 } as const;

/** Apple's macOS icon grid (Big Sur and later): an 824 px shape centered on a 1024 px canvas. */
const MACOS_SHAPE = 824 / 1024;
const MACOS_RADIUS = 185.4 / 824;
/** Figma's "iOS" corner smoothing, a close match for Apple's continuous corners. */
const MACOS_SMOOTHING = 0.6;
/** A soft drop shadow in the margin below the shape, scaled from the 1024 px grid. */
const MACOS_SHADOW = { offsetY: 10 / 1024, blur: 20 / 1024, color: 'rgba(0, 0, 0, 0.3)' };

export interface Square {
  x: number;
  y: number;
  size: number;
}

export interface TileLayout {
  /** The square the shape fills. */
  box: Square;
  /** Corner radius in pixels; 0 keeps square corners. */
  radius: number;
  /** 0 draws circular corners; higher values ease into them (see `traceRoundedSquare`). */
  smoothing: number;
  /** Where the image is drawn. */
  image: Square;
  fill: string | null;
  shadow: { offsetY: number; blur: number; color: string } | null;
}

/** True when the style leaves the image exactly as it is. */
export function isPlainTile(style: TileStyle): boolean {
  return style.corners === 'square' && !style.fill;
}

export function sameTile(a: TileStyle, b: TileStyle): boolean {
  return (
    a.corners === b.corners &&
    a.radius === b.radius &&
    a.fill === b.fill &&
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.padding === b.padding
  );
}

export function isColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Where the shape, fill, image and shadow go on a `side` × `side` canvas. */
export function tileLayout(style: TileStyle, side: number): TileLayout {
  const macos = style.corners === 'macos';
  const size = macos ? side * MACOS_SHAPE : side;
  const inset = (side - size) / 2;
  const radius =
    style.corners === 'rounded'
      ? (size * clamp(style.radius, RADIUS_RANGE.min, RADIUS_RANGE.max)) / 100
      : macos
        ? size * MACOS_RADIUS
        : 0;
  const fill = style.fill && isColor(style.color) ? style.color.toLowerCase() : null;
  const pad = fill ? (size * clamp(style.padding, PADDING_RANGE.min, PADDING_RANGE.max)) / 100 : 0;
  return {
    box: { x: inset, y: inset, size },
    radius,
    smoothing: macos ? MACOS_SMOOTHING : 0,
    image: { x: inset + pad, y: inset + pad, size: size - 2 * pad },
    fill,
    shadow: macos
      ? {
          offsetY: side * MACOS_SHADOW.offsetY,
          blur: side * MACOS_SHADOW.blur,
          color: MACOS_SHADOW.color,
        }
      : null,
  };
}

/** The image's drawn size as a fraction of the icon, so 1 means edge to edge. */
export function imageScale(style: TileStyle): number {
  return tileLayout(style, 1).image.size;
}

/** The subset of `CanvasPath` needed to trace a shape, so canvases and tests can share it. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point];

/**
 * Traces a square with rounded corners, clockwise from the top edge. With `smoothing` 0
 * the corners are circular arcs of `radius`. Higher values follow Figma's corner
 * smoothing: each corner eases from the straight edge into a shorter arc and back out,
 * so the curvature changes gradually like Apple's "continuous" corners.
 */
export function traceRoundedSquare(
  sink: PathSink,
  x: number,
  y: number,
  size: number,
  radius: number,
  smoothing: number,
): void {
  const x1 = x + size;
  const y1 = y + size;
  const s = clamp(smoothing, 0, 1);
  const r = clamp(radius, 0, size / 2 / (1 + s));
  if (r === 0) {
    sink.moveTo(x, y);
    sink.lineTo(x1, y);
    sink.lineTo(x1, y1);
    sink.lineTo(x, y1);
    sink.closePath();
    return;
  }

  const { start, curves } = cornerCurves(r, s);
  // Each corner maps (back along the incoming edge, along the outgoing edge) to the canvas.
  const corners: ((p: Point) => Point)[] = [
    ([u, v]) => [x1 - u, y + v],
    ([u, v]) => [x1 - v, y1 - u],
    ([u, v]) => [x + u, y1 - v],
    ([u, v]) => [x + v, y + u],
  ];
  corners.forEach((map, i) => {
    const [sx, sy] = map(start);
    if (i === 0) sink.moveTo(sx, sy);
    else sink.lineTo(sx, sy);
    for (const curve of curves) {
      const [[ax, ay], [bx, by], [cx, cy]] = curve.map(map);
      sink.bezierCurveTo(ax, ay, bx, by, cx, cy);
    }
  });
  sink.closePath();
}

/**
 * One corner, in coordinates relative to the corner point: `u` runs back along the edge
 * the path arrives on, `v` along the edge it leaves on. Based on "Desperately seeking
 * squircles" (Figma, 2018).
 */
function cornerCurves(r: number, s: number): { start: Point; curves: Curve[] } {
  const p = (1 + s) * r;
  const arc = (Math.PI / 2) * (1 - s);
  const chord = Math.sin(arc / 2) * r * Math.SQRT2;
  const alpha = (Math.PI / 2 - arc) / 2;
  const beta = (Math.PI / 4) * s;
  const c = r * Math.tan(alpha / 2) * Math.cos(beta);
  const d = c * Math.tan(beta);
  const b = (p - chord - c - d) / 3;
  const a = 2 * b;

  const arcStart: Point = [p - a - b - c, d];
  const arcEnd: Point = [d, p - a - b - c];
  const curves: Curve[] = [];
  if (a + b + c > 1e-9) curves.push([[p - a, 0], [p - a - b, 0], arcStart]);
  curves.push(arcCurve(r, arcStart, arcEnd));
  if (a + b + c > 1e-9)
    curves.push([
      [0, p - a - b],
      [0, p - a],
      [0, p],
    ]);
  return { start: [p, 0], curves };
}

/** A cubic Bézier for the arc of the circle centered at (r, r), between two of its points. */
function arcCurve(r: number, from: Point, to: Point): Curve {
  const angle1 = Math.atan2(from[1] - r, from[0] - r);
  const angle2 = Math.atan2(to[1] - r, to[0] - r);
  let sweep = angle2 - angle1;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const k = (4 / 3) * Math.tan(sweep / 4) * r;
  return [
    [from[0] - k * Math.sin(angle1), from[1] + k * Math.cos(angle1)],
    [to[0] + k * Math.sin(angle2), to[1] - k * Math.cos(angle2)],
    to,
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}
