export type SyncMode = 'manual' | 'on-save' | 'interval' | 'on-startup-and-close';
export type SyncScope = 'markdown-only' | 'markdown-plus-rules' | 'all-including-hidden';
export type ConflictPolicy = 'prompt' | 'prefer-local' | 'prefer-remote';

export interface SyncStrategy {
  mode: SyncMode;
  intervalSecs: 60 | 300 | 900 | 1800;
  scope: SyncScope;
  excludePatterns: string[];
  conflictPolicy: ConflictPolicy;
  maxFileSizeBytes: number;
}

export const DEFAULT_SYNC_STRATEGY: SyncStrategy = {
  mode: 'interval',
  intervalSecs: 300,
  scope: 'markdown-plus-rules',
  excludePatterns: ['node_modules/**', '.git/**', '.DS_Store', '*.tmp', '.env*', '*.key', '*.pem'],
  conflictPolicy: 'prompt',
  maxFileSizeBytes: 2 * 1024 * 1024,
};

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deletedRemote: number;
  deletedLocal: number;
  skipped: number;
  conflicts: number;
}

export interface KbBinding {
  localKbId: string;
  picoraTargetId: string;
  picoraKbId: string;
  picoraKbName: string;
  strategy: SyncStrategy;
  lastSyncAt: string | null;
  lastSyncReport: SyncReport | null;
  lastSyncError: string | null;
}

// Picora API types

export interface PicoraKb {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  docCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestEntry {
  relativePath: string;
  sourceHash: string;
  sizeBytes: number;
  updatedAt: string;
}

export type SyncOpType = 'upsert' | 'delete';

export interface SyncOp {
  op: SyncOpType;
  relativePath: string;
  content?: string;
  sourceHash?: string;
  baseUpdatedAt?: string;
}

export interface SyncBatchResult {
  applied: string[];
  conflicts: ConflictEntry[];
}

export interface ConflictEntry {
  relativePath: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localSizeBytes: number;
  remoteSizeBytes: number;
  localPreview: string;
  remotePreview: string;
  localHash: string;
  remoteHash: string;
}

export type ConflictResolution = 'prefer-local' | 'prefer-remote' | 'keep-both';

// Local manifest for three-way diff

export interface LocalManifestEntry {
  relativePath: string;
  sourceHash: string;
  sizeBytes: number;
  mtime: number;
}

export type LocalManifest = Map<string, LocalManifestEntry>;
export type RemoteManifest = Map<string, ManifestEntry>;

// Diff result

export type DiffAction =
  | { kind: 'upload'; relativePath: string }
  | { kind: 'download'; relativePath: string }
  | { kind: 'delete-remote'; relativePath: string }
  | { kind: 'delete-local'; relativePath: string }
  | { kind: 'conflict'; relativePath: string }
  | { kind: 'skip-large'; relativePath: string; sizeBytes: number }
  | { kind: 'aligned' };

export interface DiffResult {
  actions: DiffAction[];
  uploadPaths: string[];
  downloadPaths: string[];
  deleteRemotePaths: string[];
  deleteLocalPaths: string[];
  conflictPaths: string[];
  skippedLarge: Array<{ relativePath: string; sizeBytes: number }>;
}

// Sync state per KB (for UI reactivity)

export type KbSyncStatus = 'unbound' | 'idle' | 'syncing' | 'conflict' | 'error';

export interface KbSyncState {
  localKbId: string;
  status: KbSyncStatus;
  conflictCount: number;
  pendingConflicts: ConflictEntry[];
  lastError: string | null;
}
