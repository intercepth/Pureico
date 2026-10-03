/// <reference lib="webworker" />
import { zipSync, type Zippable } from 'fflate';
import { encodeIcns } from '../core/icns';
import { encodeIco } from '../core/ico';
import { MASTER_MAX, MAX_SIDE } from '../core/limits';
import type {
  ProcessRequest,
  ProcessResult,
  WorkerErrorCode,
  WorkerRequest,
  WorkerResponse,
  ZipRequest,
} from '../core/protocol';
import { ICNS_SIZES } from '../core/sizes';
import { mipChain, renderSize, squareMaster } from './resample';

declare const self: DedicatedWorkerGlobalScope;

class ProcessingError extends Error {
  constructor(
    readonly code: WorkerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const sources = new Map<string, ImageBitmap>();

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'release') {
    sources.get(request.itemId)?.close();
    sources.delete(request.itemId);
    return;
  }
  const work = request.type === 'process' ? processItem(request) : zip(request);
  work.catch((error: unknown) => {
    const failure: WorkerResponse = {
      type: 'error',
      code: error instanceof ProcessingError ? error.code : 'internal',
      message: error instanceof Error ? error.message : String(error),
      ...(request.type === 'process'
        ? { itemId: request.itemId, rev: request.rev }
        : { jobId: request.jobId }),
    };
    self.postMessage(failure);
  });
});

async function decode(source: Blob | ImageBitmap): Promise<ImageBitmap> {
  if (source instanceof ImageBitmap) return source;
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch (error) {
    if (error instanceof TypeError) {
      // Older engines reject the option value rather than the image.
      try {
        return await createImageBitmap(source);
      } catch {
        /* fall through */
      }
    }
    throw new ProcessingError('decode', 'The image could not be decoded.');
  }
}

async function processItem(request: ProcessRequest): Promise<void> {
  let bitmap = sources.get(request.itemId);
  if (!bitmap) {
    if (!request.source) throw new ProcessingError('missing-source', 'Source image missing.');
    bitmap = await decode(request.source);
    if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) {
      const { width, height } = bitmap;
      bitmap.close();
      throw new ProcessingError('too-large', `${width} × ${height} px`);
    }
    if (bitmap.width === 0 || bitmap.height === 0) {
      bitmap.close();
      throw new ProcessingError('decode', 'The image has no pixels.');
    }
    sources.set(request.itemId, bitmap);
  }

  const sizes = [...new Set(request.sizes)].sort((a, b) => b - a);
  const needsPixels = new Set<number>(request.icoSizes.filter((size) => size < 256));
  if (request.icns) {
    needsPixels.add(16);
    needsPixels.add(32);
  }

  const master = squareMaster(bitmap, request.crop, MASTER_MAX);
  const chain = mipChain(master, sizes[sizes.length - 1] ?? 16);
  const pngs = new Map<number, Uint8Array>();
  const pixels = new Map<number, Uint8ClampedArray>();

  for (const size of sizes) {
    const canvas = renderSize(chain, size);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    pngs.set(size, new Uint8Array(await blob.arrayBuffer()));
    if (needsPixels.has(size)) {
      pixels.set(size, canvas.getContext('2d')!.getImageData(0, 0, size, size).data);
    }
  }

  const ico = request.icoSizes.length
    ? encodeIco(
        request.icoSizes.map((size) => ({ size, png: pngs.get(size), rgba: pixels.get(size) })),
      )
    : undefined;
  const icns = request.icns
    ? encodeIcns(ICNS_SIZES.map((size) => ({ size, png: pngs.get(size)!, rgba: pixels.get(size) })))
    : undefined;

  const result: ProcessResult = {
    type: 'result',
    itemId: request.itemId,
    rev: request.rev,
    width: bitmap.width,
    height: bitmap.height,
    pngs: [...pngs].map(([size, data]) => ({ size, buffer: data.buffer as ArrayBuffer })),
    ico: ico?.buffer as ArrayBuffer | undefined,
    icns: icns?.buffer as ArrayBuffer | undefined,
  };
  const transfer: Transferable[] = result.pngs.map((p) => p.buffer);
  if (result.ico) transfer.push(result.ico);
  if (result.icns) transfer.push(result.icns);
  self.postMessage(result, transfer);
}

async function zip(request: ZipRequest): Promise<void> {
  const files: Zippable = {};
  for (const entry of request.entries) {
    // PNG data is already compressed; .ico bitmaps and text shrink well.
    const level = /\.(png|icns)$/i.test(entry.path) ? 0 : 6;
    files[entry.path] = [entry.data, { level }];
  }
  const zipped = zipSync(files);
  const buffer = (
    zipped.byteLength === zipped.buffer.byteLength ? zipped.buffer : zipped.slice().buffer
  ) as ArrayBuffer;
  const response: WorkerResponse = { type: 'zipped', jobId: request.jobId, buffer };
  self.postMessage(response, [buffer]);
}
