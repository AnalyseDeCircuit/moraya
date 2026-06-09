/**
 * Native menu accelerator synchronization.
 *
 * Pushes user-customized shortcut bindings (`shortcutOverrides` in the
 * settings store) to the OS-native menu via `set_menu_accelerators_batch`,
 * so the menu hint AND the original accelerator are both updated in one
 * round-trip.
 *
 * Used at two call sites:
 *  1. App startup (`+page.svelte onMount`): full sync — every catalog
 *     entry with a `menuItemId` either gets its overridden accel or its
 *     default accel (idempotent — safe to call repeatedly).
 *  2. Settings panel save/reset: same call after writing to the store.
 *
 * Failure semantics:
 *  - The Rust command never throws; it returns a `BatchResult` with `ok`
 *    and `failed` per-item arrays. The caller decides whether to roll
 *    back the settings write based on `failed.length`.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri, isMacOS } from '$lib/utils/platform';
import {
  SHORTCUT_CATALOG,
  displayShortcut,
  bindingToTauriAccel,
} from '$lib/shortcuts/catalog';

export interface MenuSyncResult {
  ok: string[];
  failed: { menuItemId: string; reason: string }[];
}

interface BatchResultRaw {
  ok: string[];
  failed: Record<string, string>;
}

/**
 * Build the full accelerator map: every catalog entry that has a
 * `menuItemId` gets either its override (if set) or its default mapped
 * to a Tauri-accel string. Entries whose binding fails to convert
 * (shouldn't happen for defaults; only user-recorded bindings can be
 * exotic) are surfaced as failed.
 */
function buildAcceleratorMap(
  overrides: Record<string, string>,
): { updates: Record<string, string | null>; conversionFailures: { menuItemId: string; reason: string }[] } {
  const updates: Record<string, string | null> = {};
  const conversionFailures: { menuItemId: string; reason: string }[] = [];

  for (const entry of SHORTCUT_CATALOG) {
    if (!entry.menuItemId) continue;
    const raw = overrides[entry.id] || displayShortcut(entry, isMacOS);
    if (!raw) {
      // Empty default + no override → clear the accel
      updates[entry.menuItemId] = null;
      continue;
    }
    const accel = bindingToTauriAccel(raw);
    if (!accel) {
      conversionFailures.push({
        menuItemId: entry.menuItemId,
        reason: `Cannot encode binding "${raw}" for ${entry.id}`,
      });
      continue;
    }
    updates[entry.menuItemId] = accel;
  }

  return { updates, conversionFailures };
}

/**
 * Push the current desired accelerator state to the native menu.
 *
 * In non-Tauri environments (web / SSR / tests) this is a no-op that
 * returns an empty result.
 */
export async function pushOverridesToMenu(
  overrides: Record<string, string>,
): Promise<MenuSyncResult> {
  if (!isTauri) {
    return { ok: [], failed: [] };
  }

  const { updates, conversionFailures } = buildAcceleratorMap(overrides);

  let backendResult: BatchResultRaw;
  try {
    backendResult = await invoke<BatchResultRaw>('set_menu_accelerators_batch', { updates });
  } catch (e) {
    // The command itself failed (IPC error / unregistered command). Treat
    // every requested update as failed so caller can roll back if needed.
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: [],
      failed: [
        ...conversionFailures,
        ...Object.keys(updates).map(id => ({ menuItemId: id, reason })),
      ],
    };
  }

  const failed = [
    ...conversionFailures,
    ...Object.entries(backendResult.failed).map(([menuItemId, reason]) => ({ menuItemId, reason })),
  ];
  return {
    ok: backendResult.ok,
    failed,
  };
}

/**
 * Apply a single override to the native menu — used by the settings
 * panel when the user saves or resets one entry. Returns true on
 * success, false if the binding could not be applied (caller should
 * roll back).
 */
export async function applySingleOverride(
  catalogId: string,
  newBinding: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isTauri) return { ok: true };

  const entry = SHORTCUT_CATALOG.find(e => e.id === catalogId);
  if (!entry || !entry.menuItemId) return { ok: true }; // no native menu hook

  // If newBinding is null, resolve back to the catalog default for that platform.
  const effective = newBinding || displayShortcut(entry, isMacOS);
  const accel = effective ? bindingToTauriAccel(effective) : null;
  // For empty defaults (e.g. Export PDF in Phase B), accel = null means "no shortcut" — that's valid.
  if (effective && !accel) {
    return { ok: false, reason: `Cannot encode "${effective}"` };
  }

  try {
    await invoke('set_menu_accelerator', {
      itemId: entry.menuItemId,
      accelerator: accel,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
