export const RECENT_LIMIT = 5;
/** Characters of sessionStorage the list may use; browsers allow roughly 5 MB. */
export const RECENT_BUDGET = 2_500_000;
const STORAGE_KEY = 'pureico:recent';

export interface RecentEntry {
  id: string;
  name: string;
  fileName: string;
  mime: string;
  size: number;
  formats: string[];
  createdAt: number;
  /** Small PNG data URL. */
  thumb: string;
}

interface StoredEntry extends RecentEntry {
  data: string;
}

/**
 * The last few downloads. Payloads live in memory and are mirrored to sessionStorage
 * (cleared when the tab closes) as far as the size budget allows, so they survive a reload.
 */
export class RecentStore {
  private entries: RecentEntry[] = [];
  private readonly blobs = new Map<string, Blob>();
  private readonly encoded = new Map<string, string>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  ) {
    this.restore();
  }

  list(): readonly RecentEntry[] {
    return this.entries;
  }

  blob(id: string): Blob | undefined {
    const blob = this.blobs.get(id);
    if (blob) return blob;
    const data = this.encoded.get(id);
    const entry = this.entries.find((e) => e.id === id);
    if (!data || !entry) return undefined;
    const restored = new Blob([base64ToBytes(data)], { type: entry.mime });
    this.blobs.set(id, restored);
    return restored;
  }

  async add(entry: RecentEntry, blob: Blob): Promise<void> {
    this.blobs.set(entry.id, blob);
    this.entries = [entry, ...this.entries.filter((e) => e.id !== entry.id)];
    for (const dropped of this.entries.splice(RECENT_LIMIT)) {
      this.blobs.delete(dropped.id);
      this.encoded.delete(dropped.id);
    }
    if (blob.size * 1.4 < RECENT_BUDGET) {
      this.encoded.set(entry.id, bytesToBase64(new Uint8Array(await blob.arrayBuffer())));
    }
    this.persist();
  }

  clear(): void {
    this.entries = [];
    this.blobs.clear();
    this.encoded.clear();
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  /** Saves as many entries as fit, newest first; older ones stay in memory only. */
  persist(): void {
    if (!this.storage) return;
    const stored: StoredEntry[] = [];
    let used = 0;
    for (const entry of this.entries) {
      const data = this.encoded.get(entry.id);
      if (!data) continue;
      const cost = data.length + entry.thumb.length + 300;
      if (used + cost > RECENT_BUDGET) continue;
      stored.push({ ...entry, data });
      used += cost;
    }
    while (true) {
      try {
        if (stored.length === 0) this.storage.removeItem(STORAGE_KEY);
        else this.storage.setItem(STORAGE_KEY, JSON.stringify(stored));
        return;
      } catch {
        if (stored.length === 0) return;
        stored.pop();
      }
    }
  }

  private restore(): void {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredEntry[];
      if (!Array.isArray(parsed)) return;
      for (const item of parsed.slice(0, RECENT_LIMIT)) {
        if (typeof item?.id !== 'string' || typeof item.data !== 'string') continue;
        const { data, ...entry } = item;
        this.entries.push(entry);
        this.encoded.set(entry.id, data);
      }
    } catch {
      /* ignore corrupt data */
    }
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
