import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { z } from "zod";

/** Something we found that may become (part of) a story. Not evidence until its full text is ingested. */
export interface Lead {
  id: string; // sha256(url) prefix
  url: string;
  title: string;
  summary?: string;
  publishedAt: string;
  market: string;
  domain: string;
  language?: string;
  via: "rss" | "gdelt";
  feedId?: string;
}

export const FeedConfig = z.object({
  id: z.string(),
  market: z.string(),
  url: z.string().url(),
  domain: z.string(),
  type: z.enum(["rss", "atom"]).default("rss"),
  enabled: z.boolean().default(false),
  /** false for high-volume alert feeds (quakes, weather): they enrich stories but never start one alone. */
  seedsStory: z.boolean().default(true),
  note: z.string().optional(),
});
export type FeedConfig = z.infer<typeof FeedConfig>;
export const FeedsFile = z.object({ feeds: z.array(FeedConfig) });

export const leadId = (url: string) => createHash("sha256").update(canonicalUrl(url)).digest("hex").slice(0, 20);

/** Drop tracking params and fragments so the same article dedupes across feeds. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|cmpid)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

const strip = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
// Namespaced duplicates (title + dc:title) parse as arrays: take the first non-empty value.
const textOf = (x: unknown): string => {
  if (Array.isArray(x)) return x.map(textOf).find((v) => v.trim()) ?? "";
  return typeof x === "object" && x !== null ? String((x as Record<string, unknown>)["#text"] ?? "") : String(x ?? "");
};

// Zone abbreviations seen in JAPAC government feeds (JS Date only knows GMT/UTC and US zones).
const TZ: Record<string, string> = {
  JST: "+09:00", KST: "+09:00", IST: "+05:30", SGT: "+08:00", MYT: "+08:00", PHT: "+08:00", HKT: "+08:00",
  CST: "+08:00", AWST: "+08:00", WIB: "+07:00", ICT: "+07:00", AEST: "+10:00", AEDT: "+11:00", ACST: "+09:30",
  ACDT: "+10:30", NZST: "+12:00", NZDT: "+13:00",
};
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

/** Lenient feed date parsing; returns null when nothing sensible can be read. */
export function parseFeedDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // Zone-less numeric dates first, as UTC, so results don't depend on the server's timezone.
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  // US-style "10/15/2026 10:58:00 PM" (e.g. Tuoi Tre), zone-less: also UTC.
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i.exec(s);
  if (m) {
    const h = (+m[4]! % 12) + (m[7]!.toUpperCase() === "PM" ? 12 : 0);
    return new Date(Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!, h, +m[5]!, +(m[6] ?? 0)));
  }
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct;
  // "Fri Oct 02 09:18:39 KST 2026" (Java Date.toString)
  m = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2}) ([A-Z]{2,5}) (\d{4})$/.exec(s);
  if (m && TZ[m[4]!] && MONTHS.includes(m[1]!.toLowerCase())) {
    const mo = String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, "0");
    return new Date(`${m[5]}-${mo}-${m[2]!.padStart(2, "0")}T${m[3]}${TZ[m[4]!]}`);
  }
  // "Fri, 09 Oct 2026 18:00:00 JST" or "2026-10-09 18:00:00 JST"
  m = /^(.*\d{1,2}:\d{2}(?::\d{2})?)\s+([A-Z]{2,5})$/.exec(s);
  if (m && TZ[m[2]!]) {
    const d = new Date(`${m[1]} GMT${TZ[m[2]!]!.replace(":", "")}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into leads. */
export function parseFeed(xml: string, feed: Pick<FeedConfig, "id" | "market" | "domain">): Lead[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true }).parse(xml);
  const rssItems = asArray(doc?.rss?.channel?.item ?? doc?.RDF?.item);
  const atomEntries = asArray(doc?.feed?.entry);
  const raw = rssItems.length
    ? rssItems.map((i: Record<string, unknown>) => ({
        url: textOf(i.link) || textOf(i.guid),
        title: textOf(i.title),
        summary: textOf(i.description),
        date: textOf(i.pubDate ?? i.date ?? i.updated),
      }))
    : atomEntries.map((e: Record<string, unknown>) => {
        const links = asArray(e.link as Record<string, string> | Record<string, string>[]);
        const alt = links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0];
        return { url: alt?.["@href"] ?? "", title: textOf(e.title), summary: textOf(e.summary ?? e.content), date: textOf(e.published ?? e.updated) };
      });
  return raw
    .filter((r) => /^https?:\/\//.test(r.url.trim()) && r.title)
    .map((r) => {
      const url = canonicalUrl(r.url.trim());
      const d = parseFeedDate(r.date);
      return {
        id: leadId(url), url, title: strip(r.title), summary: strip(r.summary).slice(0, 600) || undefined,
        publishedAt: (d ?? new Date()).toISOString(),
        market: feed.market, domain: new URL(url).hostname.toLowerCase(), via: "rss" as const, feedId: feed.id,
      };
    });
}

export async function fetchFeed(feed: FeedConfig, fetchImpl: typeof fetch = fetch): Promise<Lead[]> {
  const res = await fetchImpl(feed.url, {
    headers: { "user-agent": "OpenLensBot/0.1 (+https://openlens.app/bot)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${feed.id}: HTTP ${res.status}`);
  return parseFeed(await res.text(), feed);
}

// ---------- GDELT (discovery signal only: headlines + URLs, never used as evidence) ----------
/** GDELT `sourcecountry` names per market. */
export const GDELT_COUNTRY: Record<string, string> = {
  IN: "india", JP: "japan", KR: "southkorea", TW: "taiwan", HK: "hongkong", SG: "singapore", MY: "malaysia",
  ID: "indonesia", TH: "thailand", VN: "vietnam", PH: "philippines", AU: "australia", NZ: "newzealand",
};

const GdeltResponse = z.object({
  articles: z
    .array(z.object({ url: z.string(), title: z.string(), seendate: z.string(), domain: z.string(), language: z.string().optional() }))
    .default([]),
});

/** "20261012T101500Z" -> ISO */
export const gdeltDate = (s: string) =>
  /^\d{8}T\d{6}Z$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z` : new Date().toISOString();

export function parseGdelt(body: string, market: string): Lead[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return []; // rate-limit notices come back as plain text
  }
  const parsed = GdeltResponse.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.articles.map((a) => {
    const url = canonicalUrl(a.url);
    return { id: leadId(url), url, title: a.title.trim(), publishedAt: gdeltDate(a.seendate), market, domain: a.domain.toLowerCase(), language: a.language, via: "gdelt" as const };
  });
}

export async function fetchGdelt(market: string, minutes: number, fetchImpl: typeof fetch = fetch): Promise<Lead[]> {
  const country = GDELT_COUNTRY[market];
  if (!country) return [];
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=sourcecountry:${country}&mode=ArtList&format=json&maxrecords=75&timespan=${Math.max(15, minutes)}min&sort=DateDesc`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Throttling and errors come back as plain text with HTTP 200.
  if (!body.trimStart().startsWith("{")) throw new Error(`GDELT: ${body.slice(0, 80).replace(/\s+/g, " ")}`);
  return parseGdelt(body, market);
}
