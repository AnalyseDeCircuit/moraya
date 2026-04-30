import type { UnifiedMediaItem } from './types';

const MAX_ITEMS = 200;

interface CacheEntry {
  items: UnifiedMediaItem[];
  nextCursor: string | null;
  fetchedAt: number;
}

/** Simple LRU cache keyed by a string; max MAX_ITEMS keys. */
export class MediaLruCache {
  private map = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh insertion order (LRU touch)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
    if (this.map.size > MAX_ITEMS) {
      // Evict oldest (first) entry
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Global singleton cache — not cleared on picker close. */
export const mediaCache = new MediaLruCache();

export function makeCacheKey(
  targetId: string,
  type: string,
  q: string,
  kbScope: string,
  cursor: string,
  isPublic: boolean | undefined,
): string {
  const pub = isPublic === undefined ? 'any' : String(isPublic);
  return `${targetId}::${type}::${q}::${kbScope}::${cursor}::${pub}`;
}
