export interface IcnsImage {
  size: number;
  png: Uint8Array;
  /** Straight-alpha RGBA pixels; required for the 16 and 32 px legacy entries. */
  rgba?: Uint8Array | Uint8ClampedArray;
}

/** PNG-backed entry types, as written by Apple's iconutil. */
export const ICNS_PNG_TYPES: readonly (readonly [type: string, size: number])[] = [
  ['ic11', 32], // 16 pt @2x
  ['ic12', 64], // 32 pt @2x
  ['ic07', 128],
  ['ic13', 256], // 128 pt @2x
  ['ic08', 256],
  ['ic14', 512], // 256 pt @2x
  ['ic09', 512],
  ['ic10', 1024], // 512 pt @2x
];

/** 24-bit RLE colour + 8-bit mask pairs, readable by every macOS version. */
export const ICNS_LEGACY_TYPES: readonly (readonly [color: string, mask: string, size: number])[] =
  [
    ['is32', 's8mk', 16],
    ['il32', 'l8mk', 32],
  ];

interface Chunk {
  type: string;
  data: Uint8Array;
}

/** Builds a macOS .icns file from whichever of the standard sizes are provided. */
export function encodeIcns(images: readonly IcnsImage[]): Uint8Array {
  const bySize = new Map(images.map((img) => [img.size, img]));
  const chunks: Chunk[] = [];

  for (const [colorType, maskType, size] of ICNS_LEGACY_TYPES) {
    const rgba = bySize.get(size)?.rgba;
    if (!rgba) continue;
    if (rgba.length !== size * size * 4) {
      throw new Error(`Expected ${size * size * 4} bytes of RGBA for ${size} px`);
    }
    chunks.push({ type: colorType, data: encodeRle24(rgba, size) });
    chunks.push({ type: maskType, data: alphaPlane(rgba) });
  }

  for (const [type, size] of ICNS_PNG_TYPES) {
    const png = bySize.get(size)?.png;
    if (png) chunks.push({ type, data: png });
  }

  if (chunks.length === 0) throw new Error('An .icns needs at least one standard size.');

  const total = chunks.reduce((sum, c) => sum + 8 + c.data.length, 8);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  writeType(out, 0, 'icns');
  view.setUint32(4, total);
  let offset = 8;
  for (const chunk of chunks) {
    writeType(out, offset, chunk.type);
    view.setUint32(offset + 4, 8 + chunk.data.length);
    out.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return out;
}

/** Red, green and blue planes, each compressed separately with Apple's PackBits variant. */
function encodeRle24(rgba: Uint8Array | Uint8ClampedArray, size: number): Uint8Array {
  const pixels = size * size;
  const planes = [0, 1, 2].map((channel) => {
    const plane = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) plane[i] = rgba[i * 4 + channel];
    return packIcnsChannel(plane);
  });
  const out = new Uint8Array(planes.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const plane of planes) {
    out.set(plane, offset);
    offset += plane.length;
  }
  return out;
}

function alphaPlane(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 3];
  return out;
}

/**
 * Apple's PackBits variant: a header byte below 0x80 copies (n + 1) literal bytes,
 * a header byte of 0x80 or above repeats the next byte (n − 125) times.
 */
export function packIcnsChannel(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 130 && src[i + run] === src[i]) run++;
    if (run >= 3) {
      out.push(0x80 + run - 3, src[i]);
      i += run;
      continue;
    }
    const start = i;
    while (i < n && i - start < 128) {
      if (i + 2 < n && src[i] === src[i + 1] && src[i] === src[i + 2]) break;
      i++;
    }
    out.push(i - start - 1);
    for (let k = start; k < i; k++) out.push(src[k]);
  }
  return Uint8Array.from(out);
}

function writeType(out: Uint8Array, offset: number, type: string): void {
  for (let i = 0; i < 4; i++) out[offset + i] = type.charCodeAt(i);
}
