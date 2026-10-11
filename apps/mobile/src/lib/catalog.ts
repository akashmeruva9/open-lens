import { LANGUAGES } from '@openlens/config';

export type LangCode = keyof typeof LANGUAGES;

export const LANGUAGE_OPTIONS = (Object.keys(LANGUAGES) as LangCode[]).map((code) => ({
  code,
  name: LANGUAGES[code].name,
}));

/** Native names for the content-language switcher. */
export const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी',
  te: 'తెలుగు',
  es: 'Español',
};

export function languageName(code: string): string {
  const known = (LANGUAGES as Record<string, { name: string }>)[code];
  return known?.name ?? code.toUpperCase();
}

export const REGION_OPTIONS: { code: string; name: string }[] = [
  { code: '', name: 'All regions' },
  { code: 'IN', name: 'India · national' },
  { code: 'IN-TG', name: 'Telangana' },
  { code: 'IN-AP', name: 'Andhra Pradesh' },
  { code: 'INTL', name: 'International' },
];

export function regionName(code: string): string {
  return REGION_OPTIONS.find((r) => r.code === code)?.name ?? code;
}

export const TOPIC_OPTIONS = ['civic', 'transport', 'politics', 'economy', 'technology', 'health', 'climate', 'education'];

export function isLangCode(code: string): code is LangCode {
  return code in LANGUAGES;
}
