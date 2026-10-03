import type {
  ProcessRequest,
  ProcessResult,
  WorkerFailure,
  WorkerRequest,
  WorkerResponse,
  ZipRequest,
} from '../core/protocol';

export class WorkerError extends Error {
  constructor(readonly failure: Pick<WorkerFailure, 'code' | 'message'>) {
    super(failure.message);
  }
}

interface Job {
  key: string;
  itemId?: string;
  message: WorkerRequest;
  resolve: (value: WorkerResponse | null) => void;
  reject: (error: Error) => void;
}

interface Slot {
  worker: Worker | null;
  queue: Job[];
  running: Job | null;
  assigned: number;
}

function spawn(): Worker {
  return new Worker(new URL('../worker/processor.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pureico-processor',
  });
}

/**
 * A small pool of processing workers. Each item sticks to one worker so that worker's
 * cache of decoded images is reused; a newer request for an item replaces any queued one.
 */
export class WorkerPool {
  private readonly slots: Slot[];
  private readonly affinity = new Map<string, Slot>();
  private jobCounter = 0;

  constructor(size: number) {
    this.slots = Array.from({ length: Math.max(1, size) }, () => ({
      worker: null,
      queue: [],
      running: null,
      assigned: 0,
    }));
  }

  /** Resolves with the result, or `null` if a newer request for the item replaced it. */
  process(
    request: Omit<ProcessRequest, 'type' | 'source'>,
    source: Blob | ImageBitmap,
  ): Promise<ProcessResult | null> {
    const slot = this.slotFor(request.itemId);
    const key = `item:${request.itemId}`;
    return new Promise((resolve, reject) => {
      const job: Job = {
        key,
        itemId: request.itemId,
        // Blobs are passed by reference, so sending the source every time is cheap. The
        // worker only decodes it when the image has dropped out of its cache.
        message: { type: 'process', ...request, source },
        resolve: (value) => resolve(value as ProcessResult | null),
        reject,
      };
      const queued = slot.queue.findIndex((j) => j.key === key);
      if (queued >= 0) {
        slot.queue[queued].resolve(null);
        slot.queue[queued] = job;
      } else {
        slot.queue.push(job);
      }
      this.pump(slot);
    });
  }

  zip(entries: ZipRequest['entries']): Promise<ArrayBuffer> {
    const slot = this.slots.reduce((best, s) =>
      s.queue.length + (s.running ? 1 : 0) < best.queue.length + (best.running ? 1 : 0) ? s : best,
    );
    const jobId = `zip-${++this.jobCounter}`;
    return new Promise((resolve, reject) => {
      slot.queue.push({
        key: jobId,
        message: { type: 'zip', jobId, entries },
        resolve: (value) => resolve((value as { buffer: ArrayBuffer }).buffer),
        reject,
      });
      this.pump(slot);
    });
  }

  release(itemId: string): void {
    const slot = this.affinity.get(itemId);
    if (!slot) return;
    this.affinity.delete(itemId);
    slot.assigned--;
    slot.queue = slot.queue.filter((job) => {
      if (job.itemId !== itemId) return true;
      job.resolve(null);
      return false;
    });
    slot.worker?.postMessage({ type: 'release', itemId } satisfies WorkerRequest);
  }

  private slotFor(itemId: string): Slot {
    let slot = this.affinity.get(itemId);
    if (!slot) {
      slot = this.slots.reduce((best, s) => (s.assigned < best.assigned ? s : best));
      slot.assigned++;
      this.affinity.set(itemId, slot);
    }
    return slot;
  }

  private pump(slot: Slot): void {
    if (slot.running || slot.queue.length === 0) return;
    const job = slot.queue.shift()!;
    slot.running = job;
    const worker = this.ensureWorker(slot);
    try {
      worker.postMessage(job.message);
    } catch (error) {
      slot.running = null;
      job.reject(error instanceof Error ? error : new Error(String(error)));
      this.pump(slot);
    }
  }

  private ensureWorker(slot: Slot): Worker {
    if (slot.worker) return slot.worker;
    const worker = spawn();
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const job = slot.running;
      slot.running = null;
      const response = event.data;
      if (job) {
        if (response.type === 'error') {
          job.reject(new WorkerError(response));
        } else {
          job.resolve(response);
        }
      }
      this.pump(slot);
    });
    worker.addEventListener('error', (event) => {
      // The worker crashed (e.g. out of memory). Fail the running job and start fresh.
      event.preventDefault();
      worker.terminate();
      slot.worker = null;
      const job = slot.running;
      slot.running = null;
      job?.reject(
        new WorkerError({ code: 'internal', message: event.message || 'Worker crashed' }),
      );
      this.pump(slot);
    });
    slot.worker = worker;
    return worker;
  }
}

export function defaultPoolSize(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.min(3, Math.max(1, cores - 1));
}
