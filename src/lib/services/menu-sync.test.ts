import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('$lib/utils/platform', () => ({
  isTauri: true,
  isMacOS: true,
}));

import { invoke } from '@tauri-apps/api/core';
import { pushOverridesToMenu, applySingleOverride } from './menu-sync';

const mockedInvoke = invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pushOverridesToMenu', () => {
  it('with empty overrides pushes default accels for every menu-bound entry', async () => {
    mockedInvoke.mockResolvedValueOnce({ ok: [], failed: {} });
    await pushOverridesToMenu({});
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    const args = mockedInvoke.mock.calls[0]![1] as { updates: Record<string, string | null> };
    // Sanity: file_new should default to CmdOrCtrl+N (the mac-mapped Cmd+N)
    expect(args.updates['file_new']).toBe('CmdOrCtrl+N');
    expect(args.updates['file_save']).toBe('CmdOrCtrl+S');
    // workflow.quickOpen has no menuItemId, must not appear
    expect(Object.keys(args.updates).every(k => !k.startsWith('workflow_'))).toBe(true);
  });

  it('uses override binding when one exists', async () => {
    mockedInvoke.mockResolvedValueOnce({ ok: [], failed: {} });
    await pushOverridesToMenu({ 'file.save': 'Cmd+Shift+J' });
    const args = mockedInvoke.mock.calls[0]![1] as { updates: Record<string, string | null> };
    expect(args.updates['file_save']).toBe('CmdOrCtrl+Shift+J');
    // Other entries fall back to default
    expect(args.updates['file_new']).toBe('CmdOrCtrl+N');
  });

  it('surfaces backend per-item failures', async () => {
    mockedInvoke.mockResolvedValueOnce({
      ok: ['file_save'],
      failed: { 'file_new': 'set_accelerator failed: bad token' },
    });
    const result = await pushOverridesToMenu({});
    expect(result.ok).toEqual(['file_save']);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]!.menuItemId).toBe('file_new');
    expect(result.failed[0]!.reason).toContain('bad token');
  });

  it('surfaces conversion failures (e.g. unencodable override) without calling backend for them', async () => {
    mockedInvoke.mockResolvedValueOnce({ ok: [], failed: {} });
    // "Cmd+Frobnicate" can't be encoded by bindingToTauriAccel
    const result = await pushOverridesToMenu({ 'file.save': 'Cmd+Frobnicate' });
    expect(result.failed.some(f => f.menuItemId === 'file_save')).toBe(true);
    const args = mockedInvoke.mock.calls[0]![1] as { updates: Record<string, string | null> };
    // file_save should not appear in the updates payload
    expect(args.updates['file_save']).toBeUndefined();
  });

  it('sends accelerator=null for entries with empty default (e.g. Export PDF)', async () => {
    mockedInvoke.mockResolvedValueOnce({ ok: [], failed: {} });
    await pushOverridesToMenu({});
    const args = mockedInvoke.mock.calls[0]![1] as { updates: Record<string, string | null> };
    // Phase B entries have no default — must push null to clear any stale accel
    expect(args.updates['file_export_pdf']).toBeNull();
    expect(args.updates['file_export_image']).toBeNull();
    expect(args.updates['file_export_doc']).toBeNull();
  });

  it('honors override on entry with empty default', async () => {
    mockedInvoke.mockResolvedValueOnce({ ok: [], failed: {} });
    await pushOverridesToMenu({ 'file.exportPdf': 'Cmd+Alt+P' });
    const args = mockedInvoke.mock.calls[0]![1] as { updates: Record<string, string | null> };
    expect(args.updates['file_export_pdf']).toBe('CmdOrCtrl+Alt+P');
  });

  it('treats IPC error as failure for every requested update', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('IPC blew up'));
    const result = await pushOverridesToMenu({});
    expect(result.ok).toEqual([]);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.failed[0]!.reason).toContain('IPC blew up');
  });
});

describe('applySingleOverride', () => {
  it('sends bindingToTauriAccel result to set_menu_accelerator', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const r = await applySingleOverride('file.save', 'Cmd+Shift+J');
    expect(r.ok).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith('set_menu_accelerator', {
      itemId: 'file_save',
      accelerator: 'CmdOrCtrl+Shift+J',
    });
  });

  it('passes accelerator=null to clear the shortcut', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    // null binding falls back to the catalog default for that entry; since
    // file.save defaults to Cmd+S we expect CmdOrCtrl+S.
    const r = await applySingleOverride('file.save', null);
    expect(r.ok).toBe(true);
    const call = mockedInvoke.mock.calls[0]![1] as { accelerator: string };
    expect(call.accelerator).toBe('CmdOrCtrl+S');
  });

  it('is a no-op for entries without menuItemId', async () => {
    const r = await applySingleOverride('workflow.quickOpen', 'Cmd+J');
    expect(r.ok).toBe(true);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('rejects unencodable bindings without invoking', async () => {
    const r = await applySingleOverride('file.save', 'Cmd+Frobnicate');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Cannot encode');
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('reports backend errors verbatim', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('item not found'));
    const r = await applySingleOverride('file.save', 'Cmd+Shift+J');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('item not found');
  });
});
