import { describe, expect, it } from 'vitest';
import { sniffImage } from '../../src/core/sniff';

const text = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: (number[] | Uint8Array | string)[]) => {
  const chunks = parts.map((p) => (typeof p === 'string' ? text(p) : Uint8Array.from(p)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

describe('sniffImage', () => {
  it('reads PNG dimensions from IHDR', () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      be32(13),
      'IHDR',
      be32(640),
      be32(480),
    );
    expect(sniffImage(png)).toEqual({ supported: true, kind: 'png', width: 640, height: 480 });
  });

  it('walks JPEG segments to the frame header', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x10, ...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const sof2 = [0xff, 0xc2, 0x00, 0x11, 8, ...[0x02, 0x58], ...[0x03, 0x20], 3];
    const jpeg = bytes([0xff, 0xd8], app0, [0xff, 0xff], sof2);
    expect(sniffImage(jpeg)).toEqual({ supported: true, kind: 'jpeg', width: 800, height: 600 });
  });

  it('does not mistake a DHT segment for a frame header', () => {
    const dht = [0xff, 0xc4, 0x00, 0x04, 0, 0];
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, 0x00, 0x10, 0x00, 0x20, 3];
    expect(sniffImage(bytes([0xff, 0xd8], dht, sof0))).toMatchObject({ width: 32, height: 16 });
  });

  it('reads lossy, lossless and extended WebP headers', () => {
    const riff = (chunk: string, body: number[]) =>
      bytes('RIFF', [0, 0, 0, 0], 'WEBP', chunk, [0, 0, 0, 0], body);
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(300), ...le16(200)]);
    expect(sniffImage(lossy)).toMatchObject({ kind: 'webp', width: 300, height: 200 });

    // 14-bit (width - 1) and (height - 1) packed little-endian after the 0x2f signature.
    const w = 1000 - 1;
    const h = 500 - 1;
    const packed = w | (h << 14);
    const lossless = riff('VP8L', [
      0x2f,
      ...le16(packed & 0xffff),
      ...le16(packed >>> 16),
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(sniffImage(lossless)).toMatchObject({ kind: 'webp', width: 1000, height: 500 });

    const extended = riff('VP8X', [0, 0, 0, 0, ...le24(4095), ...le24(2047)]);
    expect(sniffImage(extended)).toMatchObject({ kind: 'webp', width: 4096, height: 2048 });
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '﻿<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 1 1"/>',
    '<!-- Made with love -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg>',
    '<!DOCTYPE svg [ <!ENTITY a "b"> ]>\n  <svg>',
  ])('detects SVG: %s', (source) => {
    expect(sniffImage(text(source))).toEqual({ supported: true, kind: 'svg' });
  });

  it.each(['<html><svg></svg></html>', 'hello world', '<svgfoo>', ''])(
    'rejects non-SVG text: %s',
    (source) => {
      expect(sniffImage(text(source)).supported).toBe(false);
    },
  );

  it('names common unsupported formats', () => {
    expect(sniffImage(text('GIF89a....'))).toEqual({ supported: false, label: 'GIF' });
    expect(sniffImage(bytes([0, 0, 0, 0x18], 'ftypheic'))).toEqual({
      supported: false,
      label: 'HEIC',
    });
    expect(sniffImage(bytes([0, 0, 0, 0x18], 'ftypavif'))).toEqual({
      supported: false,
      label: 'AVIF',
    });
    expect(sniffImage(text('%PDF-1.7'))).toEqual({ supported: false, label: 'PDF' });
    expect(sniffImage(bytes([1, 2, 3]))).toEqual({ supported: false, label: undefined });
  });
});
