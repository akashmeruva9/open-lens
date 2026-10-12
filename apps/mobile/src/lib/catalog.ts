import { LANG_CODES, LANGUAGES, MARKET_CODES, MARKETS, isLang, marketOf, regionLabel } from '@openlens/config';

export type LangCode = keyof typeof LANGUAGES;

export const LANGUAGE_OPTIONS = LANG_CODES.map((code) => ({
  code,
  name: LANGUAGES[code].name,
}));

/** Native names for the content-language switcher. */
export const NATIVE_LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LANG_CODES.map((code) => [code, LANGUAGES[code].native]),
);

export function languageName(code: string): string {
  return isLang(code) ? LANGUAGES[code].name : code.toUpperCase();
}

/** JAPAC markets; '' = all of Asia-Pacific. */
export const REGION_OPTIONS: { code: string; name: string }[] = [
  { code: '', name: 'All of Asia-Pacific' },
  ...MARKET_CODES.filter((m) => m !== 'APAC').map((code) => ({ code, name: MARKETS[code].name })),
];

export function regionName(code: string): string {
  return code ? regionLabel(code) : 'All of Asia-Pacific';
}

/** Market filter: own market (incl. sub-national regions) plus region-wide APAC stories. */
export function matchesRegion(storyRegion: string, filter: string): boolean {
  if (!filter || filter === 'APAC') return true;
  const m = marketOf(storyRegion);
  return m === 'APAC' || storyRegion === filter || m === marketOf(filter);
}

export const TOPIC_OPTIONS = ['civic', 'transport', 'politics', 'economy', 'technology', 'health', 'climate', 'education', 'trade', 'disaster'];

export function isLangCode(code: string): code is LangCode {
  return isLang(code);
}
