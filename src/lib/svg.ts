import { SVG_RASTER_SIDE } from '../core/limits';

const SVG_NS = 'http://www.w3.org/2000/svg';

const UNIT_TO_PX: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

export class SvgError extends Error {}

export interface PreparedSvg {
  /** The SVG with explicit pixel width and height, safe to load into an <img>. */
  blob: Blob;
  width: number;
  height: number;
  /** True when the file had neither a viewBox nor a size, so its shape was guessed. */
  guessedSize: boolean;
}

function parseLength(value: string | null): number | undefined {
  const match = value?.trim().match(/^([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(px|pt|pc|in|cm|mm)?$/i);
  if (!match) return undefined;
  const px = parseFloat(match[1]) * UNIT_TO_PX[(match[2] ?? '').toLowerCase()];
  return px > 0 && Number.isFinite(px) ? px : undefined;
}

function parseViewBox(value: string | null) {
  const parts = value?.trim().split(/[\s,]+/).map(Number);
  if (!parts || parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [, , w, h] = parts;
  return w > 0 && h > 0 ? { w, h } : undefined;
}

/**
 * Parses an SVG and pins its rendered size so every browser rasterizes it at a known
 * resolution. The file is only ever displayed through <img>, where scripts and
 * external resources are disabled.
 */
export async function prepareSvg(file: Blob): Promise<PreparedSvg> {
  const source = await file.text();
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    doc.getElementsByTagName('parsererror').length > 0 ||
    root.localName !== 'svg' ||
    root.namespaceURI !== SVG_NS
  ) {
    throw new SvgError('Not a valid SVG document.');
  }

  const viewBox = parseViewBox(root.getAttribute('viewBox'));
  const width = parseLength(root.getAttribute('width'));
  const height = parseLength(root.getAttribute('height'));

  let aspect = 1;
  let guessedSize = false;
  if (width && height) aspect = width / height;
  else if (viewBox) aspect = viewBox.w / viewBox.h;
  else guessedSize = true;

  if (!viewBox && width && height) root.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const rasterWidth = aspect >= 1 ? SVG_RASTER_SIDE : Math.max(1, Math.round(SVG_RASTER_SIDE * aspect));
  const rasterHeight = aspect >= 1 ? Math.max(1, Math.round(SVG_RASTER_SIDE / aspect)) : SVG_RASTER_SIDE;
  root.setAttribute('width', String(rasterWidth));
  root.setAttribute('height', String(rasterHeight));

  const serialized = new XMLSerializer().serializeToString(doc);
  return {
    blob: new Blob([serialized], { type: 'image/svg+xml' }),
    width: rasterWidth,
    height: rasterHeight,
    guessedSize,
  };
}

/** Draws a prepared SVG into a bitmap. Workers cannot decode SVG, so this runs on the page. */
export async function rasterizeSvg(svg: PreparedSvg): Promise<ImageBitmap> {
  const url = URL.createObjectURL(svg.blob);
  try {
    const img = new Image(svg.width, svg.height);
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = new OffscreenCanvas(svg.width, svg.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new SvgError('2D canvas is unavailable.');
    ctx.drawImage(img, 0, 0, svg.width, svg.height);
    return canvas.transferToImageBitmap();
  } catch (error) {
    if (error instanceof SvgError) throw error;
    throw new SvgError('The SVG could not be rendered.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
