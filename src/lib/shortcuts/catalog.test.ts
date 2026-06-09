import { describe, it, expect } from 'vitest';
import {
  canonicalizeBinding,
  eventToBinding,
  eventMatchesBinding,
  effectiveBinding,
  findBindingConflict,
  bindingToTauriAccel,
  SHORTCUT_CATALOG,
} from './catalog';

/** Build a KeyboardEvent-shape object that the matchers can read. */
function ev(key: string, opts: {
  metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; code?: string;
} = {}): KeyboardEvent {
  return {
    key,
    code: opts.code ?? '',
    metaKey: !!opts.metaKey,
    ctrlKey: !!opts.ctrlKey,
    altKey: !!opts.altKey,
    shiftKey: !!opts.shiftKey,
  } as KeyboardEvent;
}

describe('canonicalizeBinding', () => {
  it('orders modifiers Cmd, Ctrl, Alt, Shift', () => {
    expect(canonicalizeBinding('Shift+Cmd+F')).toBe('Cmd+Shift+f');
    expect(canonicalizeBinding('Alt+Ctrl+T')).toBe('Ctrl+Alt+t');
  });

  it('lowercases single-char keys, preserves named keys', () => {
    expect(canonicalizeBinding('Cmd+F')).toBe('Cmd+f');
    expect(canonicalizeBinding('Cmd+Enter')).toBe('Cmd+Enter');
    expect(canonicalizeBinding('Cmd+ArrowUp')).toBe('Cmd+ArrowUp');
  });

  it('treats Meta/Command/Cmd as equivalent', () => {
    expect(canonicalizeBinding('Meta+F')).toBe(canonicalizeBinding('Cmd+F'));
    expect(canonicalizeBinding('Command+F')).toBe(canonicalizeBinding('Cmd+F'));
  });

  it('treats Option/Alt as equivalent', () => {
    expect(canonicalizeBinding('Option+F')).toBe(canonicalizeBinding('Alt+F'));
  });

  it('returns empty for empty input', () => {
    expect(canonicalizeBinding('')).toBe('');
  });
});

describe('eventToBinding', () => {
  it('returns null for pure modifier press', () => {
    expect(eventToBinding(ev('Meta', { metaKey: true }), true)).toBeNull();
    expect(eventToBinding(ev('Shift', { shiftKey: true }), true)).toBeNull();
    expect(eventToBinding(ev('Control', { ctrlKey: true }), true)).toBeNull();
  });

  it('macOS: maps metaKey to Cmd, ctrlKey to Ctrl', () => {
    expect(eventToBinding(ev('f', { metaKey: true }), true)).toBe('Cmd+f');
    expect(eventToBinding(ev('f', { ctrlKey: true }), true)).toBe('Ctrl+f');
    expect(eventToBinding(ev('f', { metaKey: true, ctrlKey: true }), true)).toBe('Cmd+Ctrl+f');
  });

  it('Win/Linux: collapses metaKey and ctrlKey into Ctrl', () => {
    expect(eventToBinding(ev('f', { ctrlKey: true }), false)).toBe('Ctrl+f');
    expect(eventToBinding(ev('f', { metaKey: true }), false)).toBe('Ctrl+f');
  });

  it('preserves named keys verbatim', () => {
    expect(eventToBinding(ev('Enter', { metaKey: true }), true)).toBe('Cmd+Enter');
    expect(eventToBinding(ev('ArrowUp', { shiftKey: true, metaKey: true }), true)).toBe('Cmd+Shift+ArrowUp');
  });

  it('uses event.code to recover Shift+/ as Shift+/', () => {
    // Shift+/ produces '?' on US keyboards but binding should read as '/'
    const out = eventToBinding(ev('?', { metaKey: true, shiftKey: true, code: 'Slash' }), true);
    expect(out).toBe('Cmd+Shift+/');
  });

  it('lowercases single-char letters', () => {
    expect(eventToBinding(ev('F', { metaKey: true }), true)).toBe('Cmd+f');
  });
});

describe('eventMatchesBinding', () => {
  it('matches via canonical form (order independent)', () => {
    expect(eventMatchesBinding(ev('f', { metaKey: true }), 'Cmd+F', true)).toBe(true);
    expect(eventMatchesBinding(ev('f', { metaKey: true, shiftKey: true }), 'Shift+Cmd+f', true)).toBe(true);
  });

  it('rejects when modifier missing', () => {
    expect(eventMatchesBinding(ev('f'), 'Cmd+F', true)).toBe(false);
  });

  it('rejects when extra modifier present', () => {
    expect(eventMatchesBinding(ev('f', { metaKey: true, altKey: true }), 'Cmd+F', true)).toBe(false);
  });

  it('rejects key mismatch', () => {
    expect(eventMatchesBinding(ev('g', { metaKey: true }), 'Cmd+F', true)).toBe(false);
  });

  it('platform-agnostic Cmd→Ctrl on win when binding uses Cmd', () => {
    expect(eventMatchesBinding(ev('f', { ctrlKey: true }), 'Ctrl+F', false)).toBe(true);
  });
});

describe('effectiveBinding', () => {
  const entry = SHORTCUT_CATALOG.find(e => e.id === 'edit.find')!;

  it('returns default when no overrides', () => {
    expect(effectiveBinding(entry, true)).toBe('Cmd+F');
    expect(effectiveBinding(entry, false)).toBe('Ctrl+F');
  });

  it('returns default when overrides exist but not for this entry', () => {
    expect(effectiveBinding(entry, true, { 'something.else': 'Cmd+J' })).toBe('Cmd+F');
  });

  it('returns override when set', () => {
    expect(effectiveBinding(entry, true, { 'edit.find': 'Cmd+Shift+F' })).toBe('Cmd+Shift+F');
  });

  it('honors override for file.new (now customizable in v0.41.5+)', () => {
    const fileNew = SHORTCUT_CATALOG.find(e => e.id === 'file.new')!;
    expect(fileNew.customizable).toBe(true);
    expect(effectiveBinding(fileNew, true, { 'file.new': 'Cmd+Shift+N' })).toBe('Cmd+Shift+N');
  });
});

describe('findBindingConflict', () => {
  it('returns null when no conflict', () => {
    expect(findBindingConflict('Cmd+Shift+J', 'edit.find', true)).toBeNull();
  });

  it('detects conflict with another customizable entry default', () => {
    // edit.replace defaults to Cmd+H — recording it for edit.find should conflict
    const conflict = findBindingConflict('Cmd+H', 'edit.find', true);
    expect(conflict?.id).toBe('edit.replace');
  });

  it('excludes the entry being edited from conflict check', () => {
    expect(findBindingConflict('Cmd+F', 'edit.find', true)).toBeNull();
  });

  it('respects overrides when computing the existing binding to compare against', () => {
    // edit.replace has been overridden to Cmd+J → recording Cmd+H for find is OK
    const overrides = { 'edit.replace': 'Cmd+J' };
    expect(findBindingConflict('Cmd+H', 'edit.find', true, overrides)).toBeNull();
    // But recording Cmd+J for find now conflicts with the overridden replace
    expect(findBindingConflict('Cmd+J', 'edit.find', true, overrides)?.id).toBe('edit.replace');
  });

  it('detects conflict with file.new now that all entries are customizable', () => {
    // Cmd+N is file.new — recording it for edit.find should now register as conflict
    expect(findBindingConflict('Cmd+N', 'edit.find', true)?.id).toBe('file.new');
  });
});

describe('bindingToTauriAccel', () => {
  it('Cmd+F → CmdOrCtrl+F', () => {
    expect(bindingToTauriAccel('Cmd+F')).toBe('CmdOrCtrl+F');
  });

  it('Ctrl+F → CmdOrCtrl+F (Cmd and Ctrl collapse)', () => {
    expect(bindingToTauriAccel('Ctrl+F')).toBe('CmdOrCtrl+F');
  });

  it('multi-modifier Cmd+Shift+F → CmdOrCtrl+Shift+F', () => {
    expect(bindingToTauriAccel('Cmd+Shift+F')).toBe('CmdOrCtrl+Shift+F');
  });

  it('preserves named keys (Enter, Tab, Escape)', () => {
    expect(bindingToTauriAccel('Cmd+Enter')).toBe('CmdOrCtrl+Enter');
    expect(bindingToTauriAccel('Cmd+Tab')).toBe('CmdOrCtrl+Tab');
  });

  it('preserves punctuation single-chars', () => {
    expect(bindingToTauriAccel('Cmd+,')).toBe('CmdOrCtrl+,');
    expect(bindingToTauriAccel('Cmd+/')).toBe('CmdOrCtrl+/');
    expect(bindingToTauriAccel('Cmd+\\')).toBe('CmdOrCtrl+\\');
  });

  it('uppercases lowercase letters', () => {
    expect(bindingToTauriAccel('Cmd+f')).toBe('CmdOrCtrl+F');
  });

  it('accepts F-keys without modifier', () => {
    expect(bindingToTauriAccel('F5')).toBe('F5');
    expect(bindingToTauriAccel('F12')).toBe('F12');
    expect(bindingToTauriAccel('Cmd+F5')).toBe('CmdOrCtrl+F5');
  });

  it('accepts ArrowKeys / Escape without modifier', () => {
    expect(bindingToTauriAccel('Escape')).toBe('Escape');
    expect(bindingToTauriAccel('ArrowUp')).toBe('ArrowUp');
  });

  it('rejects single letter without modifier', () => {
    expect(bindingToTauriAccel('F')).toBeNull();
    expect(bindingToTauriAccel('a')).toBeNull();
  });

  it('rejects empty / whitespace', () => {
    expect(bindingToTauriAccel('')).toBeNull();
    expect(bindingToTauriAccel('+')).toBeNull();
  });

  it('rejects unknown named keys', () => {
    expect(bindingToTauriAccel('Cmd+Frobnicate')).toBeNull();
  });

  it('rejects two main keys', () => {
    expect(bindingToTauriAccel('Cmd+F+G')).toBeNull();
  });

  it('treats Option as Alt', () => {
    expect(bindingToTauriAccel('Option+F')).toBe('Alt+F');
  });

  it('treats Meta and Command as Cmd', () => {
    expect(bindingToTauriAccel('Meta+F')).toBe('CmdOrCtrl+F');
    expect(bindingToTauriAccel('Command+F')).toBe('CmdOrCtrl+F');
  });
});

describe('catalog menuItemId integrity', () => {
  it('every entry except workflow.* / aiChat.* has a menuItemId', () => {
    const missing: string[] = [];
    for (const e of SHORTCUT_CATALOG) {
      const expectMenuId = !e.id.startsWith('workflow.') && !e.id.startsWith('aiChat.');
      if (expectMenuId && !e.menuItemId) missing.push(e.id);
    }
    expect(missing).toEqual([]);
  });

  it('menuItemIds are unique', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of SHORTCUT_CATALOG) {
      if (!e.menuItemId) continue;
      if (seen.has(e.menuItemId)) dupes.push(e.menuItemId);
      seen.add(e.menuItemId);
    }
    expect(dupes).toEqual([]);
  });
});
