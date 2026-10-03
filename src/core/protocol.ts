/** Messages exchanged between the page and the processing worker. */

/** A crop rectangle in fractions of the source width and height (0–1). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProcessRequest {
  type: 'process';
  itemId: string;
  rev: number;
  /** Sent the first time a worker sees an item; the decoded image is cached afterwards. */
  source?: Blob | ImageBitmap;
  /** `null` fits the whole image onto a transparent square. */
  crop: CropRect | null;
  /** Every pixel size to render. */
  sizes: number[];
  /** Sizes to pack into the .ico; empty skips it. */
  icoSizes: number[];
  icns: boolean;
}

export interface ZipRequest {
  type: 'zip';
  jobId: string;
  entries: { path: string; data: Uint8Array }[];
}

export interface ReleaseRequest {
  type: 'release';
  itemId: string;
}

export type WorkerRequest = ProcessRequest | ZipRequest | ReleaseRequest;

export interface ProcessResult {
  type: 'result';
  itemId: string;
  rev: number;
  /** Decoded source dimensions. */
  width: number;
  height: number;
  pngs: { size: number; buffer: ArrayBuffer }[];
  ico?: ArrayBuffer;
  icns?: ArrayBuffer;
}

export interface ZipResult {
  type: 'zipped';
  jobId: string;
  buffer: ArrayBuffer;
}

export type WorkerErrorCode = 'decode' | 'too-large' | 'missing-source' | 'internal';

export interface WorkerFailure {
  type: 'error';
  itemId?: string;
  rev?: number;
  jobId?: string;
  code: WorkerErrorCode;
  message: string;
}

export type WorkerResponse = ProcessResult | ZipResult | WorkerFailure;
