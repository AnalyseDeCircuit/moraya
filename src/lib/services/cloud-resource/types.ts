export type MediaType = 'image' | 'audio' | 'video';
export type MediaStatus = 'ready' | 'processing' | 'failed';
export type KbScope = 'this-kb' | 'no-kb' | 'all';

export interface UnifiedMediaItem {
  id: string;
  type: MediaType;
  url?: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
  filename: string;
  title?: string;
  sizeBytes: number;
  durationSeconds?: number;
  status?: MediaStatus;
  isPublic: boolean;
  createdAt: string;
  tags?: string[];
  mimeType?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  kbId?: string;
}

export interface MediaListResponse {
  items: UnifiedMediaItem[];
  nextCursor: string | null;
  total?: number;
}

export interface ServerCaps {
  mediaListingV2: boolean;
}

export interface MediaListParams {
  apiBase: string;
  apiKey: string;
  type: MediaType;
  cursor?: string;
  limit?: number;
  q?: string;
  isPublic?: boolean;
  kbId?: string;
  statusFilter?: string;
}

/** State for a single picker (Recent / All / Favorites tab selection). */
export type PickerTab = 'recent' | 'all' | 'favorites';

/** Persisted picker state per tab session. */
export interface PickerState {
  targetId: string;
  kbScope: KbScope;
  type: MediaType;
  q: string;
  tab: PickerTab;
}
