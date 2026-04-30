import { invoke } from '@tauri-apps/api/core';
import type { MediaListParams, MediaListResponse, UnifiedMediaItem, ServerCaps, KbScope } from './types';

const CAPS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Derive apiBase from a Picora upload URL (strips trailing path segments). */
export function picoraApiBaseFromUploadUrl(uploadUrl: string): string {
  try {
    const u = new URL(uploadUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    // Fallback: strip /v1/... suffix
    return uploadUrl.replace(/\/v1\/.*$/, '');
  }
}

// ── Server capability detection ───────────────────────────────────────

interface CapsEntry {
  caps: ServerCaps;
  expiresAt: number;
}

const capsCache = new Map<string, CapsEntry>();

export async function getServerCaps(apiBase: string, apiKey: string, targetId: string): Promise<ServerCaps> {
  const cacheKey = `caps:${targetId}`;
  const stored = capsCache.get(cacheKey);
  if (stored && Date.now() < stored.expiresAt) return stored.caps;

  // Also check localStorage for cross-session caching
  try {
    const raw = localStorage.getItem(`picoraServerCaps:${targetId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as CapsEntry;
      if (Date.now() < parsed.expiresAt) {
        capsCache.set(cacheKey, parsed);
        return parsed.caps;
      }
    }
  } catch { /* ignore */ }

  let caps: ServerCaps;
  try {
    caps = await invoke<ServerCaps>('picora_server_caps', { apiBase, apiKey });
  } catch {
    caps = { mediaListingV2: false };
  }

  const entry: CapsEntry = { caps, expiresAt: Date.now() + CAPS_CACHE_TTL_MS };
  capsCache.set(cacheKey, entry);
  try {
    localStorage.setItem(`picoraServerCaps:${targetId}`, JSON.stringify(entry));
  } catch { /* ignore */ }

  return caps;
}

// ── MIME-type fallback for old Picora ────────────────────────────────

function inferMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Apply capability-based fallbacks to a raw item from the list API. */
function applyFallbacks(item: UnifiedMediaItem, hasV2: boolean): UnifiedMediaItem {
  if (hasV2) return item;
  return {
    ...item,
    mimeType: item.mimeType ?? inferMimeType(item.filename),
  };
}

// ── kbId query parameter resolution ─────────────────────────────────

function kbScopeToParam(kbScope: KbScope, boundKbId?: string): string | undefined {
  if (kbScope === 'this-kb') return boundKbId; // may be undefined → skip
  if (kbScope === 'no-kb') return '';           // empty string = unattached resources
  return undefined;                             // 'all' → don't send kbId param
}

// ── Public API ────────────────────────────────────────────────────────

export async function listMedia(
  params: MediaListParams & { kbScope?: KbScope; boundKbId?: string },
  targetId: string,
): Promise<MediaListResponse> {
  const { apiBase, apiKey, type, cursor, limit = 20, q, isPublic, statusFilter, kbScope = 'all', boundKbId } = params;

  const caps = await getServerCaps(apiBase, apiKey, targetId);

  const resolvedKbId = kbScope !== undefined ? kbScopeToParam(kbScope, boundKbId) : undefined;

  const raw = await invoke<MediaListResponse>('picora_media_list', {
    apiBase,
    apiKey,
    mediaType: type,
    cursor: cursor ?? null,
    limit: limit ?? 20,
    q: q ?? null,
    isPublic: isPublic ?? null,
    kbId: resolvedKbId ?? null,
    statusFilter: (!caps.mediaListingV2 && type === 'video') ? null : (statusFilter ?? null),
  });

  const items = raw.items.map(item => applyFallbacks(item, caps.mediaListingV2));

  // Client-side status filter when server doesn't support it
  const filtered = (!caps.mediaListingV2 && statusFilter && type === 'video')
    ? items.filter(i => i.status === statusFilter)
    : items;

  return { ...raw, items: filtered };
}

export async function getMediaDetail(
  apiBase: string,
  apiKey: string,
  type: string,
  id: string,
): Promise<UnifiedMediaItem> {
  return invoke<UnifiedMediaItem>('picora_media_detail', { apiBase, apiKey, mediaType: type, id });
}

export async function getVideoStatus(
  apiBase: string,
  apiKey: string,
  id: string,
) {
  return invoke('picora_video_status', { apiBase, apiKey, id });
}

export async function updateVisibility(
  apiBase: string,
  apiKey: string,
  type: string,
  id: string,
  isPublic: boolean,
): Promise<void> {
  return invoke('picora_media_update_visibility', { apiBase, apiKey, mediaType: type, id, isPublic });
}

// ── Recent / Favorites local storage ─────────────────────────────────

const RECENT_MAX = 50;
const FAV_MAX = 200;

function recentKey(targetId: string): string { return `picoraRecent:${targetId}`; }
function favKey(targetId: string): string { return `picoraFav:${targetId}`; }

export function getRecentItems(targetId: string): UnifiedMediaItem[] {
  try {
    const raw = localStorage.getItem(recentKey(targetId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addRecentItem(targetId: string, item: UnifiedMediaItem): void {
  const items = getRecentItems(targetId).filter(i => i.id !== item.id);
  items.unshift(item);
  if (items.length > RECENT_MAX) items.length = RECENT_MAX;
  try { localStorage.setItem(recentKey(targetId), JSON.stringify(items)); } catch { /* ignore */ }
}

export function getFavoriteIds(targetId: string): Set<string> {
  try {
    const raw = localStorage.getItem(favKey(targetId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export function toggleFavorite(targetId: string, id: string): boolean {
  const favs = getFavoriteIds(targetId);
  if (favs.has(id)) {
    favs.delete(id);
  } else {
    if (favs.size >= FAV_MAX) {
      // Evict oldest — order not preserved in Set, just drop one
      const first = favs.values().next().value;
      if (first !== undefined) favs.delete(first);
    }
    favs.add(id);
  }
  try { localStorage.setItem(favKey(targetId), JSON.stringify([...favs])); } catch { /* ignore */ }
  return favs.has(id);
}
