/**
 * Thin shell over `@moraya/core/i18n` — the unified i18n engine introduced
 * in v0.96.0. This file used to own its own implementation + 12 locale
 * JSONs; the engine and the locales now live in moraya-core.
 *
 * Public surface preserved for the 1,716 existing PC callsites:
 *   - `t` stays a Svelte derived store so `$t('foo')` template usage
 *     keeps auto re-rendering on locale switch.
 *   - `setLocale` stays sync-callable (eager preload at module load means
 *     the bundle is already cached when the consumer calls it).
 *   - `resolveForLocale` / `resolveAllLocales` stay sync — same reason.
 *   - `detectSystemLocale`, `isRTL` re-exported verbatim.
 *
 * Persistence: lives in `src/lib/stores/settings-store.ts` via Tauri
 * plugin-store. This shell doesn't touch persistence; the settings-store
 * calls `setLocale(...)` itself after restoring its state from disk.
 */

import {
  t as coreT,
  setLocale as coreSetLocale,
  locale as coreLocale,
  preloadAllLocales,
  detectSystemLocale,
  isRTL,
  resolveForLocale,
  resolveAllLocales,
  type SupportedLocale,
} from '@moraya/core/i18n'
import { derived } from 'svelte/store'

// Eager-load all 12 bundles at module load — restores the PC-era assumption
// that every locale's strings are sync-available (the prior implementation
// statically imported all 12 JSONs at the top of the file). This Promise
// resolves quickly (~12 dynamic imports running in parallel via the
// bundler's chunk loader) and is awaited inside loader.ts's memoized cache.
void preloadAllLocales()

/**
 * Svelte derived store. `$t('foo')` in templates re-evaluates whenever the
 * locale store updates, so component re-renders are automatic — preserving
 * the pre-v0.96.0 reactive behavior.
 */
export const t = derived(coreLocale, () => coreT)

/** Re-exported locale store for `import { locale } from '$lib/i18n'`. */
export const locale = coreLocale

/**
 * Sync-callable setLocale. Returns void (the prior signature). The async
 * load inside coreSetLocale resolves immediately after the eager preload
 * above finishes, and re-resolves are cache hits.
 */
export function setLocale(loc: SupportedLocale): void {
  void coreSetLocale(loc)
}

export { detectSystemLocale, isRTL, resolveForLocale, resolveAllLocales }
