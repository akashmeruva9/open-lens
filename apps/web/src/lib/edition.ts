// Edition = the reader's market. "APAC" shows every market. Persisted in a cookie so server
// rendering filters too (and in localStorage as a convenience mirror).
import { MARKETS, MARKET_CODES, marketOf, type MarketCode } from "@openlens/config";

export const EDITION_COOKIE = "openlens_edition";
export const DEFAULT_EDITION: MarketCode = "APAC";

export function parseEdition(v: string | undefined | null): MarketCode {
  const up = (v ?? "").toUpperCase();
  return (MARKET_CODES as string[]).includes(up) ? (up as MarketCode) : DEFAULT_EDITION;
}

/** A story belongs to an edition if it is in that market (incl. sub-national regions) or is region-wide. */
export function inEdition(region: string, edition: string): boolean {
  if (!edition || edition === "APAC") return true;
  const m = marketOf(region);
  return m === "APAC" || m === edition;
}

export const editionName = (e: string) => (MARKETS as Record<string, { name: string }>)[e]?.name ?? e;

/** Client-side: persist the edition (cookie for SSR, localStorage mirror). */
export function saveEdition(e: MarketCode) {
  document.cookie = `${EDITION_COOKIE}=${e}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  try {
    localStorage.setItem(EDITION_COOKIE, e);
  } catch {
    /* storage unavailable */
  }
}
