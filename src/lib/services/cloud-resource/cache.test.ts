import { describe, it, expect, beforeEach } from 'vitest';
import { MediaLruCache, makeCacheKey } from './cache';
import type { UnifiedMediaItem } from './types';

function makeItem(id: string): UnifiedMediaItem {
  return {
    id,
    type: 'image',
    filename: `${id}.png`,
    url: `https://cdn/${id}`,
    sizeBytes: 0,
    isPublic: false,
    createdAt: '2026-04-29T00:00:00Z',
  };
}

function makeEntry(id: string) {
  return { items: [makeItem(id)], nextCursor: null, fetchedAt: Date.now() };
}

describe('MediaLruCache', () => {
  let cache: MediaLruCache;

  beforeEach(() => {
    cache = new MediaLruCache();
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves an entry', () => {
    const entry = makeEntry('a');
    cache.set('k', entry);
    expect(cache.get('k')).toBe(entry);
  });

  it('reports correct size', () => {
    cache.set('a', makeEntry('a'));
    cache.set('b', makeEntry('b'));
    expect(cache.size).toBe(2);
  });

  it('has() returns true for existing key', () => {
    cache.set('x', makeEntry('x'));
    expect(cache.has('x')).toBe(true);
    expect(cache.has('y')).toBe(false);
  });

  it('delete() removes an entry', () => {
    cache.set('d', makeEntry('d'));
    cache.delete('d');
    expect(cache.has('d')).toBe(false);
    expect(cache.size).toBe(0);
  });

  it('clear() empties the cache', () => {
    cache.set('a', makeEntry('a'));
    cache.set('b', makeEntry('b'));
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('evicts the oldest entry when over capacity', () => {
    // Manually patch MAX_ITEMS by filling past 200 — use a fresh small cache via private map trick
    // Instead: fill 201 entries and verify the first is gone
    const c = new MediaLruCache();
    for (let i = 0; i < 201; i++) {
      c.set(`key-${i}`, makeEntry(`item-${i}`));
    }
    expect(c.size).toBe(200);
    expect(c.has('key-0')).toBe(false);
    expect(c.has('key-200')).toBe(true);
  });

  it('LRU touch: recently accessed entry is not evicted first', () => {
    const c = new MediaLruCache();
    // Fill 200 entries
    for (let i = 0; i < 200; i++) {
      c.set(`key-${i}`, makeEntry(`item-${i}`));
    }
    // Touch key-0 (move to most-recently-used)
    c.get('key-0');
    // Insert one more — should evict key-1 (oldest unaccessed), not key-0
    c.set('key-200', makeEntry('item-200'));
    expect(c.has('key-0')).toBe(true);
    expect(c.has('key-1')).toBe(false);
  });

  it('set() overwrites existing key without growing size', () => {
    cache.set('k', makeEntry('a'));
    cache.set('k', makeEntry('b'));
    expect(cache.size).toBe(1);
    expect(cache.get('k')!.items[0].id).toBe('b');
  });
});

describe('makeCacheKey', () => {
  it('produces consistent keys from the same inputs', () => {
    const k1 = makeCacheKey('t1', 'image', '', 'all', '', undefined);
    const k2 = makeCacheKey('t1', 'image', '', 'all', '', undefined);
    expect(k1).toBe(k2);
  });

  it('differentiates by targetId', () => {
    const k1 = makeCacheKey('t1', 'image', '', 'all', '', undefined);
    const k2 = makeCacheKey('t2', 'image', '', 'all', '', undefined);
    expect(k1).not.toBe(k2);
  });

  it('differentiates by type', () => {
    const k1 = makeCacheKey('t1', 'image', '', 'all', '', undefined);
    const k2 = makeCacheKey('t1', 'video', '', 'all', '', undefined);
    expect(k1).not.toBe(k2);
  });

  it('differentiates by kbScope', () => {
    const k1 = makeCacheKey('t1', 'image', '', 'all', '', undefined);
    const k2 = makeCacheKey('t1', 'image', '', 'this-kb', '', undefined);
    expect(k1).not.toBe(k2);
  });

  it('represents isPublic=undefined as "any"', () => {
    const k = makeCacheKey('t1', 'image', '', 'all', '', undefined);
    expect(k.endsWith('::any')).toBe(true);
  });

  it('represents isPublic=true as "true"', () => {
    const k = makeCacheKey('t1', 'image', '', 'all', '', true);
    expect(k.endsWith('::true')).toBe(true);
  });

  it('represents isPublic=false as "false"', () => {
    const k = makeCacheKey('t1', 'image', '', 'all', '', false);
    expect(k.endsWith('::false')).toBe(true);
  });
});
