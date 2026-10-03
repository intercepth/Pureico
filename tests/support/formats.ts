/** Minimal .ico / .icns readers used to check generated files in tests. */

export interface IcoEntry {
  width: number;
  height: number;
  bitCount: number;
  size: number;
  offset: number;
  format: 'png' | 'bmp';
  data: Uint8Array;
}

export function parseIco(bytes: Uint8Array): IcoEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error('Not an .ico file');
  }
  const count = view.getUint16(4, true);
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const size = view.getUint32(e + 8, true);
    const offset = view.getUint32(e + 12, true);
    const data = bytes.subarray(offset, offset + size);
    entries.push({
      width: bytes[e] || 256,
      height: bytes[e + 1] || 256,
      bitCount: view.getUint16(e + 6, true),
      size,
      offset,
      format: data[0] === 0x89 && data[1] === 0x50 ? 'png' : 'bmp',
      data,
    });
  }
  return entries;
}

/** Decodes a 32-bit BMP .ico entry into top-down RGBA plus its AND mask bits. */
export function decodeBmpEntry(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const height = view.getInt32(8, true) / 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const y = height - 1 - row;
    for (let x = 0; x < width; x++) {
      const src = headerSize + (row * width + x) * 4;
      const dst = (y * width + x) * 4;
      rgba[dst] = data[src + 2];
      rgba[dst + 1] = data[src + 1];
      rgba[dst + 2] = data[src];
      rgba[dst + 3] = data[src + 3];
    }
  }
  const maskStart = headerSize + width * height * 4;
  const stride = Math.ceil(width / 32) * 4;
  const masked = (x: number, y: number) => {
    const row = height - 1 - y;
    return (data[maskStart + row * stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
  };
  return { width, height, rgba, masked, headerSize, bitCount: view.getUint16(14, true) };
}

export interface IcnsChunk {
  type: string;
  data: Uint8Array;
}

export function parseIcns(bytes: Uint8Array): { length: number; chunks: IcnsChunk[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== 'icns') throw new Error('Not an .icns file');
  const length = view.getUint32(4);
  const chunks: IcnsChunk[] = [];
  let offset = 8;
  while (offset < length) {
    const type = ascii(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4);
    if (chunkLength < 8) throw new Error(`Bad chunk length for ${type}`);
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + chunkLength) });
    offset += chunkLength;
  }
  if (offset !== length) throw new Error('Chunk lengths do not add up');
  return { length, chunks };
}

/** Decodes Apple's PackBits variant, stopping once `count` bytes are produced. */
export function unpackIcnsChannel(
  data: Uint8Array,
  count: number,
  start = 0,
): { bytes: Uint8Array; next: number } {
  const out = new Uint8Array(count);
  let i = start;
  let o = 0;
  while (o < count) {
    const header = data[i++];
    if (header & 0x80) {
      const run = header - 125;
      const value = data[i++];
      for (let k = 0; k < run; k++) out[o++] = value;
    } else {
      const run = header + 1;
      for (let k = 0; k < run; k++) out[o++] = data[i++];
    }
  }
  if (o !== count) throw new Error('Run crossed the channel boundary');
  return { bytes: out, next: i };
}

export function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
