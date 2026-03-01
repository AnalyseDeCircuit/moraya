import { writable, derived } from 'svelte/store';
import type { SupportedLocale } from './types';
import { RTL_LOCALES } from './types';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhHant from './locales/zh-Hant.json';
import ar from './locales/ar.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';

const translations: Record<SupportedLocale, Record<string, unknown>> = {
  'en': en,
  'zh-CN': zhCN,
  'zh-Hant': zhHant,
  'ar': ar,
  'de': de,
  'es': es,
  'fr': fr,
  'hi': hi,
  'ja': ja,
  'ko': ko,
  'pt': pt,
  'ru': ru,
};

function resolve(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function detectSystemLocale(): SupportedLocale {
  try {
    const lang = navigator.language || navigator.languages?.[0] || 'en';

    // Chinese: distinguish Simplified vs Traditional
    if (lang.startsWith('zh')) {
      // zh-TW, zh-HK, zh-MO, zh-Hant → Traditional
      if (/zh-(TW|HK|MO|Hant)/i.test(lang)) return 'zh-Hant';
      return 'zh-CN';
    }

    const prefixMap: [string, SupportedLocale][] = [
      ['ja', 'ja'],
      ['ko', 'ko'],
      ['ar', 'ar'],
      ['hi', 'hi'],
      ['ru', 'ru'],
      ['de', 'de'],
      ['fr', 'fr'],
      ['es', 'es'],
      ['pt', 'pt'],
    ];
    for (const [prefix, locale] of prefixMap) {
      if (lang.startsWith(prefix)) return locale;
    }
  } catch {
    // SSR or navigator unavailable
  }
  return 'en';
}

/** Check if a locale uses right-to-left text direction. */
export function isRTL(loc: SupportedLocale): boolean {
  return RTL_LOCALES.includes(loc);
}

export const locale = writable<SupportedLocale>(detectSystemLocale());

export function setLocale(l: SupportedLocale) {
  locale.set(l);
  // Update document direction for RTL locales
  try {
    document.documentElement.dir = isRTL(l) ? 'rtl' : 'ltr';
  } catch {
    // SSR or document unavailable
  }
}

/**
 * Derived store that returns a translation function.
 * Usage in Svelte template: {$t('settings.theme.label')}
 * With params: {$t('settings.version', { version: '0.1.0' })}
 */
export const t = derived(locale, ($locale) => {
  return (key: string, params?: Record<string, string>): string => {
    // Try current locale, then fallback to English, then return key
    let value = resolve(translations[$locale], key)
      ?? resolve(translations['en'], key)
      ?? key;

    if (params) {
      value = value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? _);
    }

    return value;
  };
});

/**
 * Resolve a translation key for a specific locale (not the current UI locale).
 * Useful for AI-directed prompts that must match the AI's conversation language.
 */
export function resolveForLocale(
  key: string,
  loc: SupportedLocale,
  params?: Record<string, string>,
): string {
  let value = resolve(translations[loc], key)
    ?? resolve(translations['en'], key)
    ?? key;
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? _);
  }
  return value;
}

/**
 * Resolve a translation key across ALL supported locales.
 * Returns an array of translated strings (one per locale).
 * Useful for matching user-generated data that may have been created in any locale.
 */
export function resolveAllLocales(
  key: string,
  params?: Record<string, string>,
): string[] {
  return (Object.keys(translations) as SupportedLocale[]).map(loc => {
    let value = resolve(translations[loc], key) ?? key;
    if (params) {
      value = value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? _);
    }
    return value;
  });
}
