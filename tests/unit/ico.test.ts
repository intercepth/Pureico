import { describe, expect, it } from 'vitest';
import { encodeBmpIcon, encodeIco, type IcoImage } from '../../src/core/ico';
import { decodeBmpEntry, parseIco } from '../support/formats';

function image(size: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) rgba.set(fill(x, y), (y * size + x) * 4);
  }
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, size & 0xff, 1, 2, 3]);
  return { size, rgba, png } satisfies IcoImage;
}

const opaqueRed = () => [255, 0, 0, 255] as [number, number, number, number];

describe('encodeIco', () => {
  it('writes a directory sorted by size with contiguous payloads', () => {
    const ico = encodeIco([image(256, opaqueRed), image(16, opaqueRed), image(32, opaqueRed)]);
    const entries = parseIco(ico);

    expect(entries.map((e) => e.width)).toEqual([16, 32, 256]);
    expect(entries.map((e) => e.format)).toEqual(['bmp', 'bmp', 'png']);
    expect(entries.every((e) => e.bitCount === 32)).toBe(true);
    expect(ico[6 + 2 * 16]).toBe(0); // 256 is stored as 0

    let expectedOffset = 6 + 3 * 16;
    for (const entry of entries) {
      expect(entry.offset).toBe(expectedOffset);
      expectedOffset += entry.size;
    }
    expect(expectedOffset).toBe(ico.length);
  });

  it('stores the 256 px entry as the original PNG bytes', () => {
    const big = image(256, opaqueRed);
    const [entry] = parseIco(encodeIco([big]));
    expect(Array.from(entry.data)).toEqual(Array.from(big.png));
  });

  it('rejects empty, oversized and duplicate sizes', () => {
    expect(() => encodeIco([])).toThrow();
    expect(() => encodeIco([image(300, opaqueRed)])).toThrow();
    expect(() => encodeIco([image(16, opaqueRed), image(16, opaqueRed)])).toThrow();
  });
});

describe('encodeBmpIcon', () => {
  it('stores bottom-up BGRA rows and a matching AND mask', () => {
    // Left half opaque blue, right half transparent; a red pixel at the top-left corner.
    const src = image(48, (x, y) => {
      if (x === 0 && y === 0) return [255, 0, 0, 255];
      return x < 24 ? [0, 0, 255, 255] : [0, 0, 0, 0];
    });
    const bmp = encodeBmpIcon(src.rgba, 48);
    const decoded = decodeBmpEntry(bmp);

    expect(decoded.headerSize).toBe(40);
    expect(decoded.width).toBe(48);
    expect(decoded.height).toBe(48);
    expect(decoded.bitCount).toBe(32);
    expect(Array.from(decoded.rgba)).toEqual(Array.from(src.rgba));
    expect(decoded.masked(0, 0)).toBe(false);
    expect(decoded.masked(23, 47)).toBe(false);
    expect(decoded.masked(24, 0)).toBe(true);
    expect(decoded.masked(47, 47)).toBe(true);
    // 48 px rows need 6 mask bytes padded to 8.
    expect(bmp.length).toBe(40 + 48 * 48 * 4 + 8 * 48);
  });

  it('treats mostly transparent pixels as masked', () => {
    const src = image(16, (x) => [10, 20, 30, x < 8 ? 127 : 128]);
    const decoded = decodeBmpEntry(encodeBmpIcon(src.rgba, 16));
    expect(decoded.masked(7, 3)).toBe(true);
    expect(decoded.masked(8, 3)).toBe(false);
  });

  it('rejects pixel buffers of the wrong length', () => {
    expect(() => encodeBmpIcon(new Uint8Array(10), 16)).toThrow();
  });
});
