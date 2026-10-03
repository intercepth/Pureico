import { describe, expect, it } from 'vitest';
import { RECENT_LIMIT, RecentStore, type RecentEntry } from '../../src/app/recent';

class FakeStorage {
  data = new Map<string, string>();
  constructor(private readonly quota = Infinity) {}
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException('Full', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function entry(n: number): RecentEntry {
  return {
    id: `id-${n}`,
    name: `icon-${n}`,
    fileName: `icon-${n}.ico`,
    mime: 'image/x-icon',
    size: 1000,
    formats: ['ICO'],
    createdAt: n,
    thumb: 'data:image/png;base64,AAAA',
  };
}

const payload = (n: number, size = 1000) => new Blob([new Uint8Array(size).fill(n)]);

describe('RecentStore', () => {
  it(`keeps the newest ${RECENT_LIMIT} entries`, async () => {
    const store = new RecentStore(new FakeStorage());
    for (let n = 1; n <= 7; n++) await store.add(entry(n), payload(n));
    expect(store.list().map((e) => e.id)).toEqual(['id-7', 'id-6', 'id-5', 'id-4', 'id-3']);
    expect(store.blob('id-1')).toBeUndefined();
  });

  it('restores entries and their files after a reload', async () => {
    const storage = new FakeStorage();
    const first = new RecentStore(storage);
    await first.add(entry(1), payload(9, 300));

    const reloaded = new RecentStore(storage);
    expect(reloaded.list().map((e) => e.id)).toEqual(['id-1']);
    const bytes = new Uint8Array(await reloaded.blob('id-1')!.arrayBuffer());
    expect(bytes.length).toBe(300);
    expect(bytes.every((b) => b === 9)).toBe(true);
  });

  it('drops the oldest stored entries when storage is full but keeps them in memory', async () => {
    const storage = new FakeStorage(5000);
    const store = new RecentStore(storage);
    for (let n = 1; n <= 4; n++) await store.add(entry(n), payload(n, 1500));

    expect(store.list()).toHaveLength(4);
    expect(store.blob('id-1')).toBeDefined();

    const reloaded = new RecentStore(storage);
    const restored = reloaded.list().map((e) => e.id);
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.length).toBeLessThan(4);
    expect(restored[0]).toBe('id-4');
  });

  it('survives unavailable or corrupt storage', async () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new RecentStore(broken);
    await store.add(entry(1), payload(1));
    expect(store.list()).toHaveLength(1);

    const corrupt = new FakeStorage();
    corrupt.setItem('pureico:recent', '{not json');
    expect(new RecentStore(corrupt).list()).toEqual([]);
  });

  it('clears everything', async () => {
    const storage = new FakeStorage();
    const store = new RecentStore(storage);
    await store.add(entry(1), payload(1));
    store.clear();
    expect(store.list()).toEqual([]);
    expect(new RecentStore(storage).list()).toEqual([]);
  });
});
