import { describe, expect, it } from 'vitest';
import { encodeIcns, packIcnsChannel, type IcnsImage } from '../../src/core/icns';
import { ICNS_SIZES } from '../../src/core/sizes';
import { parseIcns, unpackIcnsChannel } from '../support/formats';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed >>> 24;
  };
}

describe('packIcnsChannel', () => {
  const cases: Record<string, Uint8Array> = {
    empty: new Uint8Array(0),
    single: Uint8Array.from([7]),
    pair: Uint8Array.from([7, 7]),
    triple: Uint8Array.from([7, 7, 7]),
    'max run': new Uint8Array(130).fill(9),
    'run past max': new Uint8Array(131).fill(9),
    'long literal': Uint8Array.from({ length: 300 }, (_, i) => i % 251),
    'run after literal': Uint8Array.from([1, 2, 3, 4, 4, 4, 4, 5]),
  };
  const random = seeded(42);
  cases.mixed = Uint8Array.from({ length: 4096 }, (_, i) => (i % 97 < 40 ? 200 : random()));

  for (const [name, input] of Object.entries(cases)) {
    it(`round-trips ${name}`, () => {
      const packed = packIcnsChannel(input);
      const { bytes, next } = unpackIcnsChannel(packed, input.length);
      expect(Array.from(bytes)).toEqual(Array.from(input));
      expect(next).toBe(packed.length);
    });
  }

  it('compresses flat areas', () => {
    expect(packIcnsChannel(new Uint8Array(1024)).length).toBeLessThan(20);
  });
});

describe('encodeIcns', () => {
  const random = seeded(7);
  const images: IcnsImage[] = ICNS_SIZES.map((size) => ({
    size,
    png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, size >> 8, size & 0xff]),
    rgba: size <= 32 ? Uint8Array.from({ length: size * size * 4 }, () => random()) : undefined,
  }));

  it('writes a valid container with legacy and PNG entries', () => {
    const icns = encodeIcns(images);
    const { length, chunks } = parseIcns(icns);

    expect(length).toBe(icns.length);
    expect(chunks.map((c) => c.type)).toEqual([
      'is32',
      's8mk',
      'il32',
      'l8mk',
      'ic11',
      'ic12',
      'ic07',
      'ic13',
      'ic08',
      'ic14',
      'ic09',
      'ic10',
    ]);
  });

  it('round-trips the RLE colour planes and the 8-bit masks', () => {
    const { chunks } = parseIcns(encodeIcns(images));
    for (const [colorType, maskType, size] of [
      ['is32', 's8mk', 16],
      ['il32', 'l8mk', 32],
    ] as const) {
      const rgba = images.find((img) => img.size === size)!.rgba!;
      const color = chunks.find((c) => c.type === colorType)!.data;
      const mask = chunks.find((c) => c.type === maskType)!.data;
      const pixels = size * size;

      let next = 0;
      for (let channel = 0; channel < 3; channel++) {
        const plane = unpackIcnsChannel(color, pixels, next);
        next = plane.next;
        for (let i = 0; i < pixels; i++) expect(plane.bytes[i]).toBe(rgba[i * 4 + channel]);
      }
      expect(next).toBe(color.length);
      expect(mask.length).toBe(pixels);
      for (let i = 0; i < pixels; i++) expect(mask[i]).toBe(rgba[i * 4 + 3]);
    }
  });

  it('maps each PNG to its Apple type', () => {
    const { chunks } = parseIcns(encodeIcns(images));
    const sizeOf = (type: string) => {
      const data = chunks.find((c) => c.type === type)!.data;
      return (data[4] << 8) | data[5];
    };
    expect(sizeOf('ic11')).toBe(32);
    expect(sizeOf('ic12')).toBe(64);
    expect(sizeOf('ic07')).toBe(128);
    expect(sizeOf('ic13')).toBe(256);
    expect(sizeOf('ic08')).toBe(256);
    expect(sizeOf('ic14')).toBe(512);
    expect(sizeOf('ic09')).toBe(512);
    expect(sizeOf('ic10')).toBe(1024);
  });

  it('refuses to build an empty file', () => {
    expect(() => encodeIcns([])).toThrow();
  });
});
