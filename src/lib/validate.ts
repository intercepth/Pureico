import { MAX_FILE_BYTES, MAX_SIDE } from '../core/limits';
import { SNIFF_BYTES, sniffImage, type ImageKind } from '../core/sniff';

export type Validation =
  { ok: true; kind: ImageKind; width?: number; height?: number } | { ok: false; message: string };

export const ACCEPTED_LABEL = 'PNG, JPG, SVG and WebP';

export function formatBytes(bytes: number): string {
  const trim = (value: string) => value.replace(/\.0$/, '');
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${trim((bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0))} KB`;
  return `${trim((bytes / 1024 / 1024).toFixed(1))} MB`;
}

export function quoted(name: string): string {
  const short = name.length > 48 ? `${name.slice(0, 30)}…${name.slice(-14)}` : name;
  return `“${short}”`;
}

/** Checks size, real file type (by content, not extension) and header dimensions. */
export async function validateFile(file: File): Promise<Validation> {
  const name = quoted(file.name || 'Pasted image');
  if (file.size === 0) return { ok: false, message: `${name} is empty.` };
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      message: `${name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} per file.`,
    };
  }

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  } catch {
    return { ok: false, message: `${name} couldn't be read.` };
  }

  const sniffed = sniffImage(head);
  if (!sniffed.supported) {
    const what = sniffed.label ? `is a ${sniffed.label} file` : `isn't a supported image`;
    return { ok: false, message: `${name} ${what}. Pureico accepts ${ACCEPTED_LABEL}.` };
  }

  const { width, height } = sniffed;
  if (width !== undefined && height !== undefined) {
    if (width === 0 || height === 0) return { ok: false, message: `${name} has no pixels.` };
    if (width > MAX_SIDE || height > MAX_SIDE) {
      return {
        ok: false,
        message: `${name} is ${width} × ${height} px. The limit is ${MAX_SIDE} px per side.`,
      };
    }
  }
  return { ok: true, kind: sniffed.kind, width, height };
}
