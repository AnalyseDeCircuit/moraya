import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the editor store so read_editor_content has a deterministic document.
let mockContent = '';
vi.mock('$lib/stores/editor-store', () => ({
  editorStore: {
    getState: () => ({ content: mockContent }),
  },
}));

// Stub the heavy MCP service imports — read_editor_content doesn't touch them,
// and loading the real chain pulls the i18n → core-locale-JSON dynamic imports
// (ERR_IMPORT_ATTRIBUTE_MISSING under node's ESM loader).
vi.mock('$lib/services/mcp', () => ({
  mcpStore: { getState: () => ({ servers: [], tools: [] }) },
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
}));
vi.mock('$lib/services/mcp/container-store', () => ({
  containerStore: { getState: () => ({ nodeAvailable: false }) },
}));
// container-manager statically imports $lib/i18n, which preloads @moraya/core
// locale JSONs via dynamic import (ERR_IMPORT_ATTRIBUTE_MISSING under node's
// ESM loader). read_editor_content doesn't use it — stub the exports.
vi.mock('$lib/services/mcp/container-manager', () => ({
  createService: vi.fn(),
  saveService: vi.fn(),
  removeService: vi.fn(),
  listServices: vi.fn(),
}));

import { executeInternalTool, isInternalTool, INTERNAL_TOOLS } from './internal-tools';

function call(name: string, args: Record<string, unknown> = {}) {
  return executeInternalTool({ id: 't1', name, arguments: args });
}

describe('read_editor_content tool', () => {
  beforeEach(() => { mockContent = ''; });

  it('is registered as an internal tool with no required args', () => {
    expect(isInternalTool('read_editor_content')).toBe(true);
    const def = INTERNAL_TOOLS.find(t => t.name === 'read_editor_content')!;
    expect(def).toBeTruthy();
    expect(def.input_schema.required ?? []).toEqual([]);
  });

  it('returns the FULL current document (incl. unsaved edits), not a truncation', async () => {
    mockContent = '# Title\n\n' + 'x'.repeat(5000); // larger than the 1000-char context slice
    const res = await call('read_editor_content');
    expect(res.isError).toBe(false);
    expect(res.content).toBe(mockContent);
    expect(res.content.length).toBeGreaterThan(4000);
  });

  it('reports an empty document without erroring (so the AI does not retry blindly)', async () => {
    mockContent = '   \n  ';
    const res = await call('read_editor_content');
    expect(res.isError).toBe(false);
    expect(res.content).toMatch(/empty/i);
  });
});
