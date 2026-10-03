export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg';

export type SniffResult =
  | { supported: true; kind: ImageKind; width?: number; height?: number }
  | { supported: false; label?: string };

/** How many leading bytes `sniffImage` needs to see to be reliable. */
export const SNIFF_BYTES = 256 * 1024;

const KIND_LABELS: Record<ImageKind, string> = {
  png: 'PNG',
  jpeg: 'JPG',
  webp: 'WebP',
  svg: 'SVG',
};

export function kindLabel(kind: ImageKind): string {
  return KIND_LABELS[kind];
}

/**
 * Identifies an image by its leading bytes rather than its name or MIME type, and
 * reads its pixel dimensions from the header where the format allows it.
 */
export function sniffImage(bytes: Uint8Array): SniffResult {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    const dims = bytes.length >= 24 && ascii(bytes, 12, 4) === 'IHDR' ? pngSize(bytes) : undefined;
    return { supported: true, kind: 'png', ...dims };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { supported: true, kind: 'jpeg', ...jpegSize(bytes) };
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { supported: true, kind: 'webp', ...webpSize(bytes) };
  }
  if (looksLikeSvg(bytes)) {
    return { supported: true, kind: 'svg' };
  }
  return { supported: false, label: otherLabel(bytes) };
}

function pngSize(b: Uint8Array) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(b: Uint8Array): { width?: number; height?: number } {
  let p = 2;
  while (p + 3 < b.length) {
    if (b[p] !== 0xff) return {};
    const marker = b[p + 1];
    if (marker === 0xff) {
      p++; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      p += 2; // standalone markers carry no length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return {};
    const length = (b[p + 2] << 8) | b[p + 3];
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrameHeader) {
      if (p + 9 > b.length) return {};
      return { height: (b[p + 5] << 8) | b[p + 6], width: (b[p + 7] << 8) | b[p + 8] };
    }
    if (length < 2) return {};
    p += 2 + length;
  }
  return {};
}

function webpSize(b: Uint8Array): { width?: number; height?: number } {
  if (b.length < 30) return {};
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return {};
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X') {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  return {};
}

const SVG_PROLOGUE =
  /^(?:\s+|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*<svg[\s>/]/i;

function looksLikeSvg(b: Uint8Array): boolean {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 64 * 1024));
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return SVG_PROLOGUE.test(text);
}

function otherLabel(b: Uint8Array): string | undefined {
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'GIF';
  if (ascii(b, 0, 2) === 'BM') return 'BMP';
  if (startsWith(b, [0x00, 0x00, 0x01, 0x00])) return 'ICO';
  if (ascii(b, 0, 4) === 'icns') return 'ICNS';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'AVIF';
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return 'HEIC';
  }
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'TIFF';
  }
  if (ascii(b, 0, 4) === '%PDF') return 'PDF';
  if (ascii(b, 0, 4) === '8BPS') return 'PSD';
  return undefined;
}

function startsWith(b: Uint8Array, prefix: number[]): boolean {
  return b.length >= prefix.length && prefix.every((v, i) => b[i] === v);
}

function ascii(b: Uint8Array, offset: number, length: number): string {
  if (b.length < offset + length) return '';
  return String.fromCharCode(...b.subarray(offset, offset + length));
}
