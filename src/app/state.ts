import type { ImageKind } from '../core/sniff';
import type { OutputFormats } from '../core/sizes';
import type { TileStyle } from '../core/tile';

export type Mode = 'fit' | 'crop';

/** A square crop in source-image pixels. */
export interface Crop {
  x: number;
  y: number;
  size: number;
}

export interface ItemResult {
  pngs: Map<number, Blob>;
  urls: Map<number, string>;
  ico?: Blob;
  icns?: Blob;
}

export interface Item {
  id: string;
  file: File;
  /** Unique base name used for generated files. */
  name: string;
  kind: ImageKind;
  width: number;
  height: number;
  source: Blob | ImageBitmap;
  previewUrl: string;
  mode: Mode;
  crop: Crop;
  tile: TileStyle;
  rev: number;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  notes: string[];
  result?: ItemResult;
}

export interface DownloadOption {
  label: string;
  fileName: string;
  blob: Blob;
  primary: boolean;
  itemIds: string[];
}

export interface State {
  items: Item[];
  selectedId: string | null;
  icoSizes: number[];
  formats: OutputFormats;
  /** `null` while downloads are being prepared. */
  downloads: DownloadOption[] | null;
}

type Listener = (state: State) => void;

/** Holds the app state and notifies listeners once per animation frame. */
export class Store {
  private readonly listeners = new Set<Listener>();
  private pending = false;

  constructor(readonly state: State) {}

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
    listener(this.state);
  }

  update(mutate?: (state: State) => void): void {
    mutate?.(this.state);
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      for (const listener of this.listeners) listener(this.state);
    });
  }

  selected(): Item | undefined {
    return this.state.items.find((item) => item.id === this.state.selectedId);
  }
}

export function defaultCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}
