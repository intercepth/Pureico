import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TILE,
  imageScale,
  isPlainTile,
  sameTile,
  tileLayout,
  traceRoundedSquare,
  type PathSink,
  type TileStyle,
} from '../../src/core/tile';

type P = [number, number];

interface Segment {
  from: P;
  to: P;
  c1?: P;
  c2?: P;
}

/** Records a traced path as straight and cubic segments. */
class Recorder implements PathSink {
  readonly segments: Segment[] = [];
  closed = false;
  private start: P = [0, 0];
  private at: P = [0, 0];

  moveTo(x: number, y: number) {
    this.start = [x, y];
    this.at = [x, y];
  }
  lineTo(x: number, y: number) {
    this.segments.push({ from: this.at, to: [x, y] });
    this.at = [x, y];
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    this.segments.push({ from: this.at, c1: [c1x, c1y], c2: [c2x, c2y], to: [x, y] });
    this.at = [x, y];
  }
  closePath() {
    this.segments.push({ from: this.at, to: this.start });
    this.closed = true;
  }
}

function trace(size: number, radius: number, smoothing: number): Recorder {
  const recorder = new Recorder();
  traceRoundedSquare(recorder, 0, 0, size, radius, smoothing);
  return recorder;
}

function pointAt(s: Segment, t: number): P {
  if (!s.c1 || !s.c2)
    return [s.from[0] + (s.to[0] - s.from[0]) * t, s.from[1] + (s.to[1] - s.from[1]) * t];
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    a * s.from[0] + b * s.c1[0] + c * s.c2[0] + d * s.to[0],
    a * s.from[1] + b * s.c1[1] + c * s.c2[1] + d * s.to[1],
  ];
}

function samples(segments: Segment[], steps = 24): P[] {
  return segments.flatMap((s) =>
    Array.from({ length: steps + 1 }, (_, i) => pointAt(s, i / steps)),
  );
}

function direction(from: P, to: P): P {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
}

const startTangent = (s: Segment) => direction(s.from, s.c1 ?? s.to);
const endTangent = (s: Segment) => direction(s.c2 ?? s.from, s.to);
const length = (s: Segment) => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);

/** Every join turns smoothly: the tangent leaving one segment continues into the next. */
function expectSmoothJoins(segments: Segment[]) {
  const real = segments.filter((s) => length(s) > 1e-9);
  real.forEach((segment, i) => {
    const next = real[(i + 1) % real.length];
    expect(next.from[0]).toBeCloseTo(segment.to[0], 9);
    expect(next.from[1]).toBeCloseTo(segment.to[1], 9);
    const [ax, ay] = endTangent(segment);
    const [bx, by] = startTangent(next);
    expect(Math.abs(ax * by - ay * bx)).toBeLessThan(1e-9);
    expect(ax * bx + ay * by).toBeGreaterThan(0);
  });
}

const style = (overrides: Partial<TileStyle>): TileStyle => ({ ...DEFAULT_TILE, ...overrides });

describe('tileLayout', () => {
  it('leaves square, unfilled images untouched', () => {
    expect(isPlainTile(DEFAULT_TILE)).toBe(true);
    expect(tileLayout(DEFAULT_TILE, 512)).toEqual({
      box: { x: 0, y: 0, size: 512 },
      radius: 0,
      smoothing: 0,
      image: { x: 0, y: 0, size: 512 },
      fill: null,
      shadow: null,
    });
  });

  it('sizes rounded corners as a share of the side, within limits', () => {
    expect(tileLayout(style({ corners: 'rounded', radius: 22 }), 1000).radius).toBe(220);
    expect(tileLayout(style({ corners: 'rounded', radius: 80 }), 1000).radius).toBe(500);
    expect(tileLayout(style({ corners: 'rounded', radius: 0 }), 1000).radius).toBe(20);
    expect(tileLayout(style({ corners: 'rounded', radius: Number.NaN }), 1000).radius).toBe(20);
    expect(isPlainTile(style({ corners: 'rounded' }))).toBe(false);
  });

  it("follows Apple's macOS icon grid", () => {
    const layout = tileLayout(style({ corners: 'macos' }), 1024);
    expect(layout.box).toEqual({ x: 100, y: 100, size: 824 });
    expect(layout.image).toEqual({ x: 100, y: 100, size: 824 });
    expect(layout.radius).toBeCloseTo(185.4, 9);
    expect(layout.smoothing).toBe(0.6);
    expect(layout.shadow).toEqual({ offsetY: 10, blur: 20, color: 'rgba(0, 0, 0, 0.3)' });
    expect(imageScale(style({ corners: 'macos' }))).toBeCloseTo(824 / 1024, 12);
  });

  it('pads the image only when the shape is filled', () => {
    expect(tileLayout(style({ padding: 12 }), 1000).image).toEqual({ x: 0, y: 0, size: 1000 });

    const filled = tileLayout(style({ fill: true, color: '#7C3AED', padding: 12 }), 1000);
    expect(filled.fill).toBe('#7c3aed');
    expect(filled.image).toEqual({ x: 120, y: 120, size: 760 });

    const mac = tileLayout(style({ corners: 'macos', fill: true, padding: 10 }), 1024);
    expect(mac.image.x).toBeCloseTo(182.4, 9);
    expect(mac.image.size).toBeCloseTo(659.2, 9);
    expect(tileLayout(style({ fill: true, padding: 90 }), 100).image.size).toBeCloseTo(40, 9);
  });

  it('ignores a fill color that is not #rrggbb', () => {
    for (const color of ['red', '#fff', 'url(x)', '#12345g', '']) {
      expect(tileLayout(style({ fill: true, color }), 100).fill).toBeNull();
    }
  });

  it('compares styles by value', () => {
    expect(sameTile(style({ color: '#ABCDEF' }), style({ color: '#abcdef' }))).toBe(true);
    expect(sameTile(style({ radius: 20 }), style({ radius: 21 }))).toBe(false);
    expect(sameTile(style({ fill: true }), DEFAULT_TILE)).toBe(false);
  });
});

describe('traceRoundedSquare', () => {
  it('traces a plain square without a radius', () => {
    const path = trace(10, 0, 0);
    expect(path.closed).toBe(true);
    expect(path.segments.map((s) => s.to)).toEqual([
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });

  it('draws circular corners when not smoothed', () => {
    const path = trace(100, 20, 0);
    expect(path.closed).toBe(true);
    expectSmoothJoins(path.segments);
    const centers: P[] = [
      [80, 20],
      [80, 80],
      [20, 80],
      [20, 20],
    ];
    const curves = path.segments.filter((s) => s.c1);
    expect(curves).toHaveLength(4);
    curves.forEach((curve, i) => {
      for (const [x, y] of samples([curve])) {
        expect(Math.hypot(x - centers[i][0], y - centers[i][1])).toBeCloseTo(20, 1);
      }
    });
  });

  it('makes a circle at half the side', () => {
    const path = trace(100, 50, 0);
    expectSmoothJoins(path.segments);
    for (const [x, y] of samples(path.segments)) {
      expect(Math.abs(Math.hypot(x - 50, y - 50) - 50)).toBeLessThan(0.02);
    }
  });

  it('eases into Apple-style continuous corners', () => {
    const size = 824;
    const r = 185.4;
    const path = trace(size, r, 0.6);
    expect(path.closed).toBe(true);
    expect(path.segments[0].from[0]).toBeCloseTo(size - 1.6 * r, 9);
    expect(path.segments[0].from[1]).toBe(0);
    expect(path.segments.filter((s) => s.c1)).toHaveLength(12);
    expectSmoothJoins(path.segments);

    // The middle of each corner is still an arc of the full radius, so the shape keeps the
    // familiar size while the curve starts earlier along the edges.
    const arc = path.segments[1];
    for (const [x, y] of samples([arc])) {
      expect(Math.hypot(x - (size - r), y - r)).toBeCloseTo(r, 1);
    }
    const [mx, my] = pointAt(arc, 0.5);
    expect(Math.hypot(size - mx, my)).toBeCloseTo(r * (Math.SQRT2 - 1), 1);
  });

  it.each([
    [0, 'circular'],
    [0.6, 'smoothed'],
  ])('stays inside the box, touches every edge and is symmetric (%s, %s)', (smoothing) => {
    const size = 200;
    const points = samples(trace(size, 45, smoothing).segments, 48);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(size, 9);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...ys)).toBeCloseTo(size, 9);

    // Mirrored across the diagonal, every point lands on the outline again.
    for (const [x, y] of points.filter((_, i) => i % 7 === 0)) {
      const nearest = Math.min(...points.map(([px, py]) => Math.hypot(px - y, py - x)));
      expect(nearest).toBeLessThan(0.5);
    }
  });

  it('offsets the shape to its box and limits the radius to fit', () => {
    const path = new Recorder();
    traceRoundedSquare(path, 100, 100, 824, 600, 0.6);
    const points = samples(path.segments);
    expect(Math.min(...points.map(([x]) => x))).toBeCloseTo(100, 9);
    expect(Math.max(...points.map(([x]) => x))).toBeCloseTo(924, 9);
    expectSmoothJoins(path.segments);
  });
});
