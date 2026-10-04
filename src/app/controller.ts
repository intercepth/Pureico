import { MAX_FILES } from '../core/limits';
import { extensionIconPath, manifestIcons } from '../core/manifest';
import { baseName, ICNS_FILE_NAME, icoFileName, uniqueNames } from '../core/names';
import type { CropRect } from '../core/protocol';
import { EXTENSION_SIZES, ICNS_SIZES, ICO_SIZES, type OutputFormats } from '../core/sizes';
import { kindLabel } from '../core/sniff';
import { DEFAULT_TILE, isPlainTile, sameTile, type TileStyle } from '../core/tile';
import { WorkerError, type WorkerPool } from '../lib/pool';
import { prepareSvg, rasterizeSvg, SvgError } from '../lib/svg';
import { formatBytes, quoted, validateFile } from '../lib/validate';
import type { RecentStore } from './recent';
import {
  defaultCrop,
  type Crop,
  type DownloadOption,
  type Item,
  type Mode,
  type Store,
} from './state';

export interface Notifier {
  show(region: string, kind: 'error' | 'warning', text: string, key?: string): void;
  clear(region: string, key?: string): void;
}

interface OutputFile {
  path: string;
  blob: Blob;
}

const PREFS_KEY = 'pureico:prefs';

let idCounter = 0;
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${++idCounter}`;
}

export class Controller {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private downloadsToken = 0;
  private adding: Promise<void> = Promise.resolve();
  /** The corner style chosen last, which newly added images start with. */
  private lastTile: TileStyle = { ...DEFAULT_TILE };

  constructor(
    private readonly store: Store,
    private readonly pool: WorkerPool,
    private readonly recents: RecentStore,
    private readonly notify: Notifier,
    private readonly onRecentsChange: () => void,
  ) {}

  get state() {
    return this.store.state;
  }

  /** Validates and adds files one by one, keeping their order. */
  addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return this.adding;
    this.notify.clear('input');
    this.adding = this.adding.then(() => this.addSequentially(files));
    return this.adding;
  }

  private async addSequentially(files: File[]): Promise<void> {
    const room = MAX_FILES - this.state.items.length;
    const accepted = files.slice(0, Math.max(0, room));
    const skipped = files.length - accepted.length;
    if (skipped > 0) {
      this.notify.show(
        'input',
        'warning',
        `Pureico converts up to ${MAX_FILES} images at a time, so ${skipped} ${
          skipped === 1 ? 'file was' : 'files were'
        } skipped.`,
        'limit',
      );
    }

    let firstAdded: string | null = null;
    for (const file of accepted) {
      const item = await this.createItem(file);
      if (!item) continue;
      this.store.update((s) => {
        s.items.push(item);
        if (!firstAdded) {
          firstAdded = item.id;
          s.selectedId = item.id;
        }
      });
      this.schedule(item, 0);
    }
  }

  private async createItem(file: File): Promise<Item | null> {
    const label = quoted(file.name || 'Pasted image');
    const check = await validateFile(file);
    if (!check.ok) {
      this.notify.show('input', 'error', check.message);
      return null;
    }

    const existing = this.state.items.map((i) => i.name);
    const name = uniqueNames([...existing, baseName(file.name || 'pasted-image')]).at(-1)!;
    const notes: string[] = [];
    let source: Blob | ImageBitmap = file;
    let previewUrl: string;
    let width: number;
    let height: number;

    try {
      if (check.kind === 'svg') {
        const svg = await prepareSvg(file);
        source = await rasterizeSvg(svg);
        previewUrl = URL.createObjectURL(svg.blob);
        width = svg.width;
        height = svg.height;
        if (svg.guessedSize) {
          notes.push(
            `${label} has no size or viewBox, so Pureico guessed a square canvas. Check the preview.`,
          );
        }
      } else {
        previewUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = previewUrl;
        try {
          await img.decode();
        } catch {
          URL.revokeObjectURL(previewUrl);
          throw new Error('decode');
        }
        width = img.naturalWidth;
        height = img.naturalHeight;
        if (!width || !height) {
          URL.revokeObjectURL(previewUrl);
          throw new Error('decode');
        }
      }
    } catch (error) {
      const message =
        error instanceof SvgError
          ? `${label} couldn't be read as an SVG.`
          : `${label} couldn't be decoded. The file may be damaged.`;
      this.notify.show('input', 'error', message);
      return null;
    }

    return {
      id: newId(),
      file,
      name,
      kind: check.kind,
      width,
      height,
      source,
      previewUrl,
      mode: 'fit',
      crop: defaultCrop(width, height),
      tile: { ...this.lastTile },
      rev: 0,
      status: 'processing',
      notes,
    };
  }

  remove(id: string): void {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.pool.release(id);
    this.disposeItem(item);
    this.store.update((s) => {
      const index = s.items.indexOf(item);
      s.items.splice(index, 1);
      if (s.selectedId === id)
        s.selectedId = s.items[Math.min(index, s.items.length - 1)]?.id ?? null;
    });
    if (this.state.items.length === 0) this.notify.clear('output');
    this.refreshDownloads();
  }

  clearAll(): void {
    for (const item of [...this.state.items]) this.remove(item.id);
    this.notify.clear('input');
  }

  select(id: string): void {
    this.store.update((s) => {
      s.selectedId = id;
    });
  }

  setMode(mode: Mode): void {
    const item = this.store.selected();
    if (!item || item.mode === mode) return;
    item.mode = mode;
    this.schedule(item, 0);
  }

  setCrop(crop: Crop, settle: boolean): void {
    const item = this.store.selected();
    if (!item) return;
    item.crop = crop;
    this.schedule(item, settle ? 0 : 140);
  }

  setTile(change: Partial<TileStyle>, settle: boolean): void {
    const item = this.store.selected();
    if (!item) return;
    const tile = { ...item.tile, ...change };
    if (sameTile(tile, item.tile)) return;
    item.tile = tile;
    this.lastTile = { ...tile };
    this.schedule(item, settle ? 0 : 140);
  }

  /** Gives every image the selected image's corner style. */
  applyTileToAll(): void {
    const selected = this.store.selected();
    if (!selected) return;
    for (const item of this.state.items) {
      if (sameTile(item.tile, selected.tile)) continue;
      item.tile = { ...selected.tile };
      if (item.status === 'error' && !item.result) continue;
      this.schedule(item, 30);
    }
    this.store.update();
  }

  setFormats(formats: OutputFormats): void {
    const before = this.state.formats;
    this.store.update((s) => {
      s.formats = formats;
    });
    this.savePrefs();
    const needsRender = before.ico !== formats.ico || before.icns !== formats.icns;
    if (needsRender) this.reprocessAll();
    else this.refreshDownloads();
  }

  setIcoSizes(sizes: number[]): void {
    const sorted = [...new Set(sizes)].sort((a, b) => a - b);
    this.store.update((s) => {
      s.icoSizes = sorted;
    });
    this.savePrefs();
    if (this.state.formats.ico) this.reprocessAll();
    else this.refreshDownloads();
  }

  private reprocessAll(): void {
    for (const item of this.state.items) {
      if (item.status === 'error' && !item.result) continue;
      this.schedule(item, 30);
    }
    this.refreshDownloads();
  }

  /** Queues a render of `item` after `delay` ms; newer requests replace older ones. */
  private schedule(item: Item, delay: number): void {
    item.rev++;
    item.status = 'processing';
    item.error = undefined;
    this.invalidateDownloads();
    clearTimeout(this.timers.get(item.id));
    this.timers.set(
      item.id,
      setTimeout(() => {
        this.timers.delete(item.id);
        void this.run(item);
      }, delay),
    );
  }

  private async run(item: Item): Promise<void> {
    const rev = item.rev;
    const { formats, icoSizes } = this.state;
    const sizes = new Set<number>(ICO_SIZES);
    if (formats.icns) ICNS_SIZES.forEach((s) => sizes.add(s));

    try {
      const result = await this.pool.process(
        {
          itemId: item.id,
          rev,
          crop: item.mode === 'crop' ? this.normalizedCrop(item) : null,
          tile: isPlainTile(item.tile) ? null : { ...item.tile },
          sizes: [...sizes],
          icoSizes: formats.ico ? icoSizes : [],
          icns: formats.icns,
        },
        item.source,
      );
      if (!result || !this.isCurrent(item, rev)) return;
      const pngs = new Map<number, Blob>();
      const urls = new Map<number, string>();
      for (const { size, buffer } of result.pngs) {
        const blob = new Blob([buffer], { type: 'image/png' });
        pngs.set(size, blob);
        if (size <= 256) urls.set(size, URL.createObjectURL(blob));
      }
      this.revokeResult(item);
      item.result = {
        pngs,
        urls,
        ico: result.ico ? new Blob([result.ico], { type: 'image/x-icon' }) : undefined,
        icns: result.icns ? new Blob([result.icns], { type: 'image/icns' }) : undefined,
      };
      item.status = 'ready';
    } catch (error) {
      if (!this.isCurrent(item, rev)) return;
      item.status = 'error';
      item.error = this.describeError(item, error);
    }
    this.store.update();
    this.refreshDownloads();
  }

  private isCurrent(item: Item, rev: number): boolean {
    return item.rev === rev && this.state.items.includes(item);
  }

  private normalizedCrop(item: Item): CropRect {
    const { crop, width, height } = item;
    return {
      x: crop.x / width,
      y: crop.y / height,
      w: crop.size / width,
      h: crop.size / height,
    };
  }

  private describeError(item: Item, error: unknown): string {
    const label = quoted(item.file.name || item.name);
    if (error instanceof WorkerError) {
      if (error.failure.code === 'too-large') {
        return `${label} is ${error.failure.message}. The limit is 8192 px per side.`;
      }
      if (error.failure.code === 'decode') {
        return `${label} couldn't be decoded. The file may be damaged.`;
      }
    }
    return `${label} couldn't be converted. Try another image or reload the page.`;
  }

  private invalidateDownloads(): void {
    this.downloadsToken++;
    this.store.update((s) => {
      s.downloads = null;
    });
  }

  /** Builds the download buttons once every item has settled. */
  refreshDownloads(): void {
    const token = ++this.downloadsToken;
    this.store.update((s) => {
      s.downloads = null;
    });
    if (this.state.items.some((i) => i.status === 'processing')) return;
    void this.buildDownloads(token);
  }

  private async buildDownloads(token: number): Promise<void> {
    const ready = this.state.items.filter((i) => i.status === 'ready' && i.result);
    const options: DownloadOption[] = [];

    try {
      if (ready.length === 1) {
        const [item] = ready;
        const files = this.filesFor(item);
        const ico = files.find((f) => f.path.endsWith('.ico'));
        const icns = files.find((f) => f.path.endsWith('.icns'));
        const extFiles = files.filter(
          (f) => f.path.startsWith('icons/') || f.path.endsWith('.json'),
        );
        if (ico) options.push(this.option(`Download ${ico.path}`, ico.path, ico.blob, [item]));
        if (icns) {
          options.push(this.option(`Download ${icns.path}`, icns.path, icns.blob, [item]));
        }
        if (extFiles.length) {
          const zip = await this.zip(extFiles);
          options.push(
            this.option('Extension icons (.zip)', `${item.name}-extension.zip`, zip, [item]),
          );
        }
        if (options.length > 1) {
          const zip = await this.zip(files);
          options.unshift(
            this.option('Download all (.zip)', `${item.name}-icons.zip`, zip, [item]),
          );
        }
      } else if (ready.length > 1) {
        const files = ready.flatMap((item) =>
          this.filesFor(item).map((f) => ({ path: `${item.name}/${f.path}`, blob: f.blob })),
        );
        if (files.length) {
          const zip = await this.zip(files);
          options.push(
            this.option(`Download all ${ready.length} (.zip)`, 'pureico-icons.zip', zip, ready),
          );
        }
      }
    } catch {
      if (token !== this.downloadsToken) return;
      this.notify.show(
        'output',
        'error',
        'Preparing the download failed. Please try again.',
        'zip',
      );
    }

    if (token !== this.downloadsToken) return;
    options.forEach((o, i) => (o.primary = i === 0));
    this.store.update((s) => {
      s.downloads = options;
    });
  }

  private option(label: string, fileName: string, blob: Blob, items: Item[]): DownloadOption {
    return { label, fileName, blob, primary: false, itemIds: items.map((i) => i.id) };
  }

  /** The files one image contributes to a download, given the current settings. */
  filesFor(item: Item): OutputFile[] {
    const { formats, icoSizes } = this.state;
    const result = item.result;
    if (!result) return [];
    const files: OutputFile[] = [];
    if (formats.ico && icoSizes.length > 0 && result.ico) {
      files.push({ path: icoFileName(icoSizes), blob: result.ico });
    }
    if (formats.icns && result.icns) files.push({ path: ICNS_FILE_NAME, blob: result.icns });
    if (formats.ext) {
      for (const size of EXTENSION_SIZES) {
        const png = result.pngs.get(size);
        if (png) files.push({ path: extensionIconPath(size), blob: png });
      }
      const json = `${JSON.stringify(manifestIcons(), null, 2)}\n`;
      files.push({
        path: 'manifest-icons.json',
        blob: new Blob([json], { type: 'application/json' }),
      });
    }
    return files;
  }

  private async zip(files: OutputFile[]): Promise<Blob> {
    const entries = await Promise.all(
      files.map(async (f) => ({ path: f.path, data: new Uint8Array(await f.blob.arrayBuffer()) })),
    );
    const buffer = await this.pool.zip(entries);
    return new Blob([buffer], { type: 'application/zip' });
  }

  /** Remembers what was just downloaded so it can be fetched again from Recent conversions. */
  async recordDownload(option: DownloadOption): Promise<void> {
    const items = option.itemIds
      .map((id) => this.state.items.find((i) => i.id === id))
      .filter((i): i is Item => !!i?.result)
      .slice(-5);
    for (const item of items) {
      let blob = option.blob;
      let fileName = option.fileName;
      let formats = labelsFor(fileName) ?? this.formatLabels();
      if (option.itemIds.length > 1) {
        // A batch zip holds every image; remember each image's own files instead.
        const files = this.filesFor(item);
        if (files.length === 0) continue;
        if (files.length === 1) [{ blob, path: fileName }] = files;
        else [blob, fileName] = [await this.zip(files), `${item.name}-icons.zip`];
        formats = labelsFor(fileName) ?? this.formatLabels();
      }
      const thumbSource = item.result!.pngs.get(64) ?? item.result!.pngs.get(48);
      await this.recents.add(
        {
          id: `${item.id}:${item.rev}:${fileName}`,
          name: item.name,
          fileName,
          mime: blob.type || 'application/octet-stream',
          size: blob.size,
          formats,
          createdAt: Date.now(),
          thumb: thumbSource ? await blobToDataUrl(thumbSource) : '',
        },
        blob,
      );
    }
    this.onRecentsChange();
  }

  formatLabels(): string[] {
    const { formats, icoSizes } = this.state;
    const labels: string[] = [];
    if (formats.ico && icoSizes.length) labels.push('ICO');
    if (formats.icns) labels.push('ICNS');
    if (formats.ext) labels.push('Extension');
    return labels;
  }

  /** Human-readable summary of an item for the file list. */
  describe(item: Item): string {
    const dimensions = item.kind === 'svg' ? 'Vector' : `${item.width} × ${item.height}`;
    return `${dimensions} · ${kindLabel(item.kind)} · ${formatBytes(item.file.size)}`;
  }

  private revokeResult(item: Item): void {
    item.result?.urls.forEach((url) => URL.revokeObjectURL(url));
  }

  private disposeItem(item: Item): void {
    this.revokeResult(item);
    URL.revokeObjectURL(item.previewUrl);
    if (item.source instanceof ImageBitmap) item.source.close();
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ formats: this.state.formats, icoSizes: this.state.icoSizes }),
      );
    } catch {
      /* preferences are optional */
    }
  }
}

export function loadPrefs(): { formats?: OutputFormats; icoSizes?: number[] } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { formats?: Partial<OutputFormats>; icoSizes?: unknown };
    const sizes = Array.isArray(parsed.icoSizes)
      ? parsed.icoSizes.filter((s): s is number => (ICO_SIZES as readonly number[]).includes(s))
      : undefined;
    const f = parsed.formats;
    const formats =
      f && typeof f === 'object'
        ? { ico: f.ico === true, icns: f.icns === true, ext: f.ext === true }
        : undefined;
    return { formats, icoSizes: sizes };
  } catch {
    return {};
  }
}

/** Format labels for a single downloaded file, or `undefined` for a bundle of everything. */
function labelsFor(fileName: string): string[] | undefined {
  if (fileName.endsWith('.ico')) return ['ICO'];
  if (fileName.endsWith('.icns')) return ['ICNS'];
  if (fileName.endsWith('-extension.zip')) return ['Extension'];
  return undefined;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}
