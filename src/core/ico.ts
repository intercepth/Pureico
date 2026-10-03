export interface IcoImage {
  /** Width and height in pixels, 1–256. */
  size: number;
  /** PNG encoding of the image, used for 256 px entries. */
  png: Uint8Array;
  /** Straight-alpha RGBA pixels (size × size × 4), used for BMP entries. */
  rgba: Uint8Array | Uint8ClampedArray;
}

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;
const BITMAPINFOHEADER_SIZE = 40;

/**
 * Builds a Windows .ico file.
 *
 * Entries below 256 px are stored as 32-bit BMPs with an AND mask, which every
 * Windows version and icon tool can read. The 256 px entry is stored as PNG, as
 * Windows Vista and later expect, which keeps the file small.
 */
export function encodeIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error('An .ico needs at least one image.');
  const sorted = [...images].sort((a, b) => a.size - b.size);
  sorted.forEach((img, i) => {
    if (!Number.isInteger(img.size) || img.size < 1 || img.size > 256) {
      throw new Error(`Unsupported .ico size: ${img.size}`);
    }
    if (i > 0 && sorted[i - 1].size === img.size) {
      throw new Error(`Duplicate .ico size: ${img.size}`);
    }
  });

  const payloads = sorted.map((img) =>
    img.size === 256 ? img.png : encodeBmpIcon(img.rgba, img.size),
  );
  const headerSize = ICONDIR_SIZE + ICONDIRENTRY_SIZE * sorted.length;
  const total = payloads.reduce((sum, p) => sum + p.length, headerSize);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // 1 = icon
  view.setUint16(4, sorted.length, true);

  let offset = headerSize;
  sorted.forEach((img, i) => {
    const entry = ICONDIR_SIZE + i * ICONDIRENTRY_SIZE;
    const dimension = img.size === 256 ? 0 : img.size; // 0 means 256
    out[entry] = dimension;
    out[entry + 1] = dimension;
    out[entry + 2] = 0; // palette size
    out[entry + 3] = 0; // reserved
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, payloads[i].length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(payloads[i], offset);
    offset += payloads[i].length;
  });

  return out;
}

/** Encodes RGBA pixels as the BMP payload of an .ico entry (header + BGRA rows + AND mask). */
export function encodeBmpIcon(rgba: Uint8Array | Uint8ClampedArray, size: number): Uint8Array {
  if (rgba.length !== size * size * 4) {
    throw new Error(`Expected ${size * size * 4} bytes of RGBA, got ${rgba.length}`);
  }
  const xorSize = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskSize = maskStride * size;
  const out = new Uint8Array(BITMAPINFOHEADER_SIZE + xorSize + maskSize);
  const view = new DataView(out.buffer);

  view.setUint32(0, BITMAPINFOHEADER_SIZE, true);
  view.setInt32(4, size, true);
  view.setInt32(8, size * 2, true); // XOR bitmap + AND mask
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  view.setUint32(16, 0, true); // BI_RGB
  view.setUint32(20, xorSize + maskSize, true);

  // Rows are stored bottom-up, pixels as BGRA.
  let p = BITMAPINFOHEADER_SIZE;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      out[p++] = rgba[i + 2];
      out[p++] = rgba[i + 1];
      out[p++] = rgba[i];
      out[p++] = rgba[i + 3];
    }
  }

  // AND mask: 1 bit per pixel, set where the pixel is (mostly) transparent.
  const maskStart = BITMAPINFOHEADER_SIZE + xorSize;
  for (let row = 0; row < size; row++) {
    const y = size - 1 - row;
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] < 128) {
        out[maskStart + row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return out;
}
