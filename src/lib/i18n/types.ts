export type SupportedLocale =
  | 'en' | 'zh-CN' | 'zh-Hant'
  | 'ar' | 'de' | 'es' | 'fr' | 'hi' | 'ja' | 'ko' | 'pt' | 'ru';

export type LocaleSelection = SupportedLocale | 'system';

export interface LocaleOption {
  code: LocaleSelection;
  label: string; // Always in that language's own script
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: 'system', label: 'System' },
  { code: 'ar', label: 'العربية' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
];

/** Locales that use right-to-left text direction. */
export const RTL_LOCALES: SupportedLocale[] = ['ar'];
