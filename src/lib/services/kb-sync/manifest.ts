import { invoke } from '@tauri-apps/api/core';
import { homeDir } from '@tauri-apps/api/path';
import type { LocalManifest, RemoteManifest, ManifestEntry } from './types';
import type { SyncScope } from './types';

interface FileStatEntry {
  path: string;
  relative_path: string;
  size: number;
  mtime: number;
  sha256: string;
}

/** Build a LocalManifest by scanning the KB root directory via Tauri IPC. */
export async function buildLocalManifest(
  kbPath: string,
  scope: SyncScope,
  excludePatterns: string[],
): Promise<LocalManifest> {
  const entries = await invoke<FileStatEntry[]>('kb_sync_scan_dir', {
    rootPath: kbPath,
    scope,
    excludePatterns,
  });

  const manifest: LocalManifest = new Map();
  for (const entry of entries) {
    manifest.set(entry.relative_path, {
      relativePath: entry.relative_path,
      sourceHash: entry.sha256,
      sizeBytes: entry.size,
      mtime: entry.mtime,
    });
  }
  return manifest;
}

/** Persist lastManifest to ~/.moraya/kb-sync/{localKbId}.manifest.json */
export async function saveLastManifest(
  localKbId: string,
  manifest: RemoteManifest,
): Promise<void> {
  const home = await homeDir();
  const manifestPath = `${home}/.moraya/kb-sync/${localKbId}.manifest.json`;
  const obj: Record<string, ManifestEntry> = {};
  for (const [k, v] of manifest) {
    obj[k] = v;
  }
  await invoke('write_file', { path: manifestPath, content: JSON.stringify(obj, null, 2) });
}

/** Load the persisted lastManifest from disk, returns empty map if not found. */
export async function loadLastManifest(localKbId: string): Promise<RemoteManifest> {
  try {
    const home = await homeDir();
    const manifestPath = `${home}/.moraya/kb-sync/${localKbId}.manifest.json`;
    const content = await invoke<string>('read_file', { path: manifestPath });
    const obj = JSON.parse(content) as Record<string, ManifestEntry>;
    const map: RemoteManifest = new Map();
    for (const [k, v] of Object.entries(obj)) {
      map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Move a file to the trash directory before deleting locally. */
export async function moveToTrash(
  kbPath: string,
  localKbId: string,
  relativePath: string,
): Promise<void> {
  const home = await homeDir();
  const ts = Date.now();
  const trashDest = `${home}/.moraya/trash/${localKbId}/${ts}/${relativePath}`;
  await invoke('kb_sync_move_to_trash', {
    srcPath: `${kbPath}/${relativePath}`,
    destPath: trashDest,
  });
}
