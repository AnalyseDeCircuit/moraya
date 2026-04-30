import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ── Module mocks (must be hoisted before imports) ─────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('./manifest', () => ({
  buildLocalManifest: vi.fn(),
  loadLastManifest: vi.fn(),
  saveLastManifest: vi.fn(),
  moveToTrash: vi.fn(),
}));

vi.mock('./picora-kb-client', () => ({
  picoraApiBase: vi.fn((url: string) => url.replace('/upload', '')),
  listKbs: vi.fn(),
  createKb: vi.fn(),
  fetchManifest: vi.fn(),
  syncBatch: vi.fn(),
  fetchRaw: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { buildLocalManifest, loadLastManifest, saveLastManifest, moveToTrash } from './manifest';
import { fetchManifest, syncBatch, fetchRaw } from './picora-kb-client';
import { kbSyncStore, runSync, dryRunSync, clearAllIntervals } from './sync-service';
import type { KbBinding, LocalManifestEntry, ManifestEntry, ConflictEntry } from './types';
import type { KnowledgeBase } from '$lib/stores/files-store';
import type { ImageHostTarget } from '$lib/services/image-hosting/types';

// ── Test fixtures ─────────────────────────────────────────────────────

function makeBinding(overrides?: Partial<KbBinding>): KbBinding {
  return {
    localKbId: 'kb-1',
    picoraTargetId: 'target-1',
    picoraKbId: 'remote-kb-1',
    picoraKbName: 'Test KB',
    strategy: {
      mode: 'manual',
      intervalSecs: 300,
      scope: 'markdown-plus-rules',
      excludePatterns: [],
      conflictPolicy: 'prompt',
      maxFileSizeBytes: 2 * 1024 * 1024,
    },
    lastSyncAt: null,
    lastSyncReport: null,
    lastSyncError: null,
    ...overrides,
  };
}

function makeKb(): KnowledgeBase {
  return {
    id: 'kb-1',
    name: 'Test KB',
    path: '/Users/test/TestKB',
  } as KnowledgeBase;
}

function makeTarget(): ImageHostTarget {
  return {
    id: 'target-1',
    provider: 'picora',
    picoraApiUrl: 'https://picora.example.com/upload',
    picoraApiKey: 'sk-test-key',
  } as unknown as ImageHostTarget;
}

function localEntry(hash: string, size = 100): LocalManifestEntry {
  return { relativePath: '', sourceHash: hash, sizeBytes: size, mtime: Date.now() };
}

function remoteEntry(hash: string, size = 100): ManifestEntry {
  return {
    relativePath: '',
    sourceHash: hash,
    sizeBytes: size,
    updatedAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearAllIntervals();
});

describe('kbSyncStore', () => {
  it('initialises as empty Map', () => {
    const state = get(kbSyncStore);
    expect(state instanceof Map).toBe(true);
  });

  it('setState updates a single kb entry', () => {
    kbSyncStore.setState('kb-x', { status: 'syncing', conflictCount: 0, pendingConflicts: [], lastError: null });
    const s = kbSyncStore.getState('kb-x');
    expect(s.status).toBe('syncing');
  });

  it('getState returns default for unknown kb', () => {
    const s = kbSyncStore.getState('kb-unknown');
    expect(s.status).toBe('unbound');
    expect(s.conflictCount).toBe(0);
  });
});

describe('dryRunSync', () => {
  it('returns diff summary without executing ops', async () => {
    const local = new Map([['note.md', localEntry('aaa')]]);
    const last = new Map<string, ManifestEntry>();
    const remoteEntries: ManifestEntry[] = [];

    vi.mocked(buildLocalManifest).mockResolvedValue(local);
    vi.mocked(loadLastManifest).mockResolvedValue(last);
    vi.mocked(fetchManifest).mockResolvedValue(remoteEntries);

    const result = await dryRunSync(makeBinding(), makeKb(), makeTarget());

    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.diff).toBeDefined();
    expect(result.diff?.uploadPaths).toContain('note.md');

    // No real ops should fire
    expect(syncBatch).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sets kbSyncStore status to idle after dry-run', async () => {
    vi.mocked(buildLocalManifest).mockResolvedValue(new Map());
    vi.mocked(loadLastManifest).mockResolvedValue(new Map());
    vi.mocked(fetchManifest).mockResolvedValue([]);

    await dryRunSync(makeBinding(), makeKb(), makeTarget());

    expect(kbSyncStore.getState('kb-1').status).toBe('idle');
  });
});

describe('runSync — success path', () => {
  it('uploads a new local file and saves manifest', async () => {
    const localManifest = new Map([['note.md', localEntry('aaa')]]);
    const lastManifest = new Map<string, ManifestEntry>();
    const remoteEntries: ManifestEntry[] = [];

    vi.mocked(buildLocalManifest).mockResolvedValue(localManifest);
    vi.mocked(loadLastManifest).mockResolvedValue(lastManifest);
    vi.mocked(fetchManifest).mockResolvedValue(remoteEntries);
    vi.mocked(invoke).mockResolvedValue('# Hello');
    vi.mocked(syncBatch).mockResolvedValue({ applied: ['note.md'], conflicts: [] });

    const report = await runSync(makeBinding(), makeKb(), makeTarget(), false);

    expect(report.uploaded).toBe(1);
    expect(saveLastManifest).toHaveBeenCalledOnce();
    expect(kbSyncStore.getState('kb-1').status).toBe('idle');
  });

  it('downloads a new remote file and writes it locally', async () => {
    const localManifest = new Map<string, LocalManifestEntry>();
    const lastManifest = new Map<string, ManifestEntry>();
    const remoteEntries: ManifestEntry[] = [{
      relativePath: 'remote.md',
      sourceHash: 'bbb',
      sizeBytes: 50,
      updatedAt: new Date().toISOString(),
    }];

    vi.mocked(buildLocalManifest).mockResolvedValue(localManifest);
    vi.mocked(loadLastManifest).mockResolvedValue(lastManifest);
    vi.mocked(fetchManifest).mockResolvedValue(remoteEntries);
    vi.mocked(fetchRaw).mockResolvedValue('# Remote');
    vi.mocked(invoke).mockResolvedValue(undefined); // write_file

    const report = await runSync(makeBinding(), makeKb(), makeTarget(), false);

    expect(report.downloaded).toBe(1);
    expect(fetchRaw).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'remote-kb-1',
      'remote.md',
    );
    expect(invoke).toHaveBeenCalledWith('write_file', expect.objectContaining({
      path: expect.stringContaining('remote.md'),
    }));
  });

  it('deletes local file (move to trash) when remote deleted it', async () => {
    const lastManifest = new Map<string, ManifestEntry>([
      ['gone.md', { relativePath: 'gone.md', sourceHash: 'aaa', sizeBytes: 50, updatedAt: '' }],
    ]);
    const localManifest = new Map([['gone.md', localEntry('aaa')]]);
    const remoteEntries: ManifestEntry[] = [];

    vi.mocked(buildLocalManifest).mockResolvedValue(localManifest);
    vi.mocked(loadLastManifest).mockResolvedValue(lastManifest);
    vi.mocked(fetchManifest).mockResolvedValue(remoteEntries);

    const report = await runSync(makeBinding(), makeKb(), makeTarget(), false);

    expect(report.deletedLocal).toBe(1);
    expect(moveToTrash).toHaveBeenCalledWith('/Users/test/TestKB', 'kb-1', 'gone.md');
  });

  it('detects conflict and sets kbSyncStore to conflict', async () => {
    const lastManifest = new Map<string, ManifestEntry>([
      ['conflict.md', { relativePath: 'conflict.md', sourceHash: 'aaa', sizeBytes: 50, updatedAt: '' }],
    ]);
    const localManifest = new Map([['conflict.md', localEntry('bbb')]]);
    const remoteEntries: ManifestEntry[] = [{
      relativePath: 'conflict.md',
      sourceHash: 'ccc',
      sizeBytes: 50,
      updatedAt: new Date().toISOString(),
    }];

    vi.mocked(buildLocalManifest).mockResolvedValue(localManifest);
    vi.mocked(loadLastManifest).mockResolvedValue(lastManifest);
    vi.mocked(fetchManifest).mockResolvedValue(remoteEntries);
    vi.mocked(syncBatch).mockResolvedValue({ applied: [], conflicts: [] });

    const report = await runSync(makeBinding(), makeKb(), makeTarget(), false);

    expect((report.conflicts as ConflictEntry[]).length).toBeGreaterThan(0);
    const state = kbSyncStore.getState('kb-1');
    expect(state.status).toBe('conflict');
    expect(state.conflictCount).toBeGreaterThan(0);
  });

  it('calls onComplete callback with the sync report', async () => {
    vi.mocked(buildLocalManifest).mockResolvedValue(new Map());
    vi.mocked(loadLastManifest).mockResolvedValue(new Map());
    vi.mocked(fetchManifest).mockResolvedValue([]);

    const onComplete = vi.fn();
    await runSync(makeBinding(), makeKb(), makeTarget(), false, onComplete);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ uploaded: 0 }));
  });
});

describe('runSync — error path', () => {
  it('sets kbSyncStore to error state on exception', async () => {
    vi.mocked(buildLocalManifest).mockRejectedValue(new Error('Network failure'));

    await expect(runSync(makeBinding(), makeKb(), makeTarget(), false)).rejects.toThrow('Network failure');

    const state = kbSyncStore.getState('kb-1');
    expect(state.status).toBe('error');
    expect(state.lastError).toBe('Network failure');
  });

  it('handles string errors from invoke', async () => {
    vi.mocked(buildLocalManifest).mockRejectedValue('invoke failed: permission denied');

    await expect(runSync(makeBinding(), makeKb(), makeTarget(), false)).rejects.toBe(
      'invoke failed: permission denied'
    );

    expect(kbSyncStore.getState('kb-1').lastError).toBe('invoke failed: permission denied');
  });
});
