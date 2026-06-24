/**
 * Re-export the canonical type surface from @moraya/core/i18n.
 *
 * Pre-v0.96.0 these types were defined here; the canonical home is now
 * moraya-core, and this file is kept as a thin re-export so the
 * `import … from '$lib/i18n/types'` pattern keeps working.
 */
export {
  SUPPORTED_LOCALES,
  RTL_LOCALES,
  type SupportedLocale,
  type LocaleSelection,
  type LocaleOption,
} from '@moraya/core/i18n'
