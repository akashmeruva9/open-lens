import { isLang, LANGUAGES, marketOf, regionLabel } from "@openlens/config";

export const langName = (code: string) => (isLang(code) ? LANGUAGES[code].name : code.toUpperCase());
export const langNative = (code: string) => (isLang(code) ? LANGUAGES[code].native : code.toUpperCase());

export const regionName = (code: string) => regionLabel(code);

/** Market filter: own market (incl. sub-national regions) plus region-wide APAC stories. */
export function matchesRegion(storyRegion: string, filter: string): boolean {
  if (!filter || filter === "APAC") return true;
  const m = marketOf(storyRegion);
  return m === "APAC" || storyRegion === filter || m === marketOf(filter);
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.round((now - t) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(-Math.round(s / secs), unit);
  }
  return "just now";
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
