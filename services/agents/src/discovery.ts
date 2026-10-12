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
const textOf = (x: unknown): string => (typeof x === "object" && x !== null ? String((x as Record<string, unknown>)["#text"] ?? "") : String(x ?? ""));

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
      const d = new Date(r.date);
      return {
        id: leadId(url), url, title: strip(r.title), summary: strip(r.summary).slice(0, 600) || undefined,
        publishedAt: Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
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
