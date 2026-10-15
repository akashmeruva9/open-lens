import { Readability } from "@mozilla/readability";
import { LANG_CODES } from "@openlens/config";
import { SourceRecord, SourceType, Lens } from "@openlens/schemas";
import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { robotsAllows } from "./robots.js";

/** A domain we are permitted to ingest, with its documented lens rating and usage rights. */
export const AllowlistEntry = z.object({
  domain: z.string().describe("e.g. example.com (subdomains match)"),
  publisher: z.string(),
  market: z.string(),
  sourceType: SourceType,
  lens: z.object({ rating: Lens, ratingBasis: z.string().min(3).describe("documented basis for the rating, or 'primary document'") }),
  rights: z.object({ license: z.string(), usage: z.string() }),
  /** Set true only after a human has checked the outlet's reuse terms. Unverified entries are never ingested. */
  verified: z.boolean().default(false),
  termsUrl: z.string().optional(),
});
export type AllowlistEntry = z.infer<typeof AllowlistEntry>;
export const Allowlist = z.object({ entries: z.array(AllowlistEntry) });

export function allowlistEntryFor(url: string, list: AllowlistEntry[]): AllowlistEntry | undefined {
  const host = new URL(url).hostname.toLowerCase();
  return list.find((e) => e.verified && (host === e.domain || host.endsWith(`.${e.domain}`)));
}

/** Map an HTML lang attribute (ja-JP, zh-TW, zh-Hans…) to a supported language code. */
export function normalizeLang(raw: string | null | undefined, text: string): string {
  const l = (raw ?? "").toLowerCase();
  if (l.startsWith("zh")) return /tw|hk|hant/.test(l) ? "zh-Hant" : "zh-Hans";
  if (l.startsWith("tl") || l.startsWith("fil")) return "fil";
  if (l === "in") return "id";
  const base = l.split("-")[0]!;
  if ((LANG_CODES as string[]).includes(base)) return base;
  // Script fallback when the page has no lang attribute.
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[가-힯]/.test(text)) return "ko";
  if (/[฀-๿]/.test(text)) return "th";
  if (/[ఀ-౿]/.test(text)) return "te";
  if (/[஀-௿]/.test(text)) return "ta";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[一-鿿]/.test(text)) return "zh-Hans";
  return "en";
}

export interface IntakeResult {
  source?: SourceRecord;
  rejected?: string;
}

/** Fetch an allowlisted URL and extract the article into a SourceRecord. */
/** CJK/Thai pack far more meaning per character: a 190-character Japanese statement is a full release. */
export const minTextLength = (text: string) => (/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/.test(text) ? 60 : 200);

export async function intakeUrl(
  url: string,
  storyId: string,
  sourceId: string,
  allowlist: AllowlistEntry[],
  fetchImpl: typeof fetch = fetch,
  /** Feed-provided title/summary, used for non-HTML items (XML alerts, data files) from permitted outlets. */
  fallback?: { title: string; summary?: string; publishedAt?: string },
): Promise<IntakeResult> {
  const entry = allowlistEntryFor(url, allowlist);
  if (!entry) return { rejected: `${new URL(url).hostname} is not a verified entry in data/sources/allowlist.json (add it with rights + rating basis, then set verified: true)` };
  if (!(await robotsAllows(url, fetchImpl))) return { rejected: `robots.txt of ${new URL(url).hostname} does not allow OpenLensBot to fetch this page` };
  const res = await fetchImpl(url, { headers: { "user-agent": "OpenLensBot/0.1 (+https://openlens.app/bot)", accept: "text/html" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return { rejected: `HTTP ${res.status}` };
  const ctype = res.headers.get("content-type") ?? "";
  if (!/html/i.test(ctype)) {
    const text = [fallback?.title, fallback?.summary].filter(Boolean).join("\n").trim();
    if (!fallback || text.length < minTextLength(text)) return { rejected: `non-HTML content (${ctype.split(";")[0] || "unknown"}) and no usable feed summary` };
    return {
      source: SourceRecord.parse({
        id: sourceId, storyId, url, publisher: entry.publisher, title: fallback.title, publishedAt: fallback.publishedAt ?? new Date().toISOString(),
        language: normalizeLang(null, text), sourceType: entry.sourceType, lens: entry.lens, rights: entry.rights, text,
        contentHash: createHash("sha256").update(text).digest("hex"),
      }),
    };
  }
  const html = await res.text();
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  const text = (article?.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < minTextLength(text)) return { rejected: "could not extract article text (paywall, script-rendered page or not an article)" };
  const meta = (name: string) =>
    document.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ?? document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
  const published = meta("article:published_time") ?? meta("date") ?? document.querySelector("time[datetime]")?.getAttribute("datetime");
  const source = SourceRecord.parse({
    id: sourceId,
    storyId,
    url,
    publisher: entry.publisher,
    title: article?.title || meta("og:title") || url,
    publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
    language: normalizeLang(document.documentElement?.getAttribute("lang"), text),
    sourceType: entry.sourceType,
    lens: entry.lens,
    rights: entry.rights,
    text,
    contentHash: createHash("sha256").update(text).digest("hex"),
  });
  return { source };
}
