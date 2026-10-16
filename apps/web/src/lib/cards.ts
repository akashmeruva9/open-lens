// Read model for the video-first home: a FeedItem plus the video details a card needs.
// Pure (no server/browser APIs) so server and client components share it.
import { MARKETS, isLang, marketOf, type MarketCode } from "@openlens/config";
import type { FeedItem, StoryBundle, VideoPayload } from "@openlens/schemas";

export interface CardVideo {
  lang: string;
  aspect?: "9:16" | "16:9";
  durationSeconds?: number;
  thumbnailUrl?: string;
  mp4Url?: string;
  hlsUrl?: string;
  aiPresenter: boolean;
}

export interface CardItem extends FeedItem {
  market: MarketCode | undefined;
  videos: CardVideo[];
}

/**
 * Build a card. With a bundle (story page) every rendered video is listed with duration and
 * thumbnail; from a feed item we use `videos`, else `videoUrl`.
 */
export function toCard(f: FeedItem, bundle?: StoryBundle): CardItem {
  let videos: CardVideo[] = [];
  if (bundle) {
    videos = bundle.outputs
      .filter((o) => o.kind === "video" && typeof o.payload.mp4Url === "string")
      .map((o) => {
        const p = o.payload as unknown as VideoPayload;
        return {
          lang: o.lang, aspect: p.aspect, durationSeconds: p.durationSeconds, thumbnailUrl: p.thumbnailUrl,
          mp4Url: p.mp4Url, hlsUrl: p.hlsUrl, aiPresenter: o.aiDisclosure,
        };
      })
      // vertical first: cards and the hero are 9:16 / 2:3
      .sort((a, b) => (a.aspect === "9:16" ? 0 : 1) - (b.aspect === "9:16" ? 0 : 1));
  } else if (f.videos?.length) {
    videos = f.videos;
  } else if (f.videoUrl) {
    // Every OpenLens video uses a disclosed synthetic presenter (plan §1b), so the tag is safe to show.
    videos = [{ lang: f.languages.includes("en") ? "en" : (f.languages[0] ?? "en"), mp4Url: f.videoUrl, aiPresenter: true }];
  }
  return { ...f, market: marketOf(f.region), videos };
}

/** The video to show for an edition: first of the market's languages that exists, else English, else any. */
export function pickVideo(card: CardItem, edition: string): CardVideo | undefined {
  if (!card.videos.length) return undefined;
  const prefs = [...((MARKETS as Record<string, { languages: readonly string[] }>)[edition]?.languages ?? []), "en"];
  for (const l of prefs) {
    const v = card.videos.find((x) => x.lang === l);
    if (v) return v;
  }
  return card.videos[0];
}

export const hasVideo = (c: CardItem) => c.videos.length > 0;

export function formatDuration(s?: number): string | undefined {
  if (s === undefined || !Number.isFinite(s)) return undefined;
  const r = Math.max(0, Math.round(s));
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

export const langOk = (l: string) => isLang(l);

// ---------- categories ----------

export interface Category { slug: string; label: string; topics: string[] }

/** Home navigation. Story topics are free-form strings, so each category lists the topics it absorbs. */
export const CATEGORIES: Category[] = [
  { slug: "politics", label: "Politics", topics: ["politics", "election", "elections", "government", "policy", "law", "diplomacy", "conflict"] },
  { slug: "economy", label: "Economy", topics: ["economy", "business", "trade", "markets", "prices", "energy", "jobs", "finance"] },
  { slug: "climate", label: "Climate & Disasters", topics: ["climate", "disaster", "disasters", "weather", "environment", "water", "earthquake"] },
  { slug: "tech", label: "Tech", topics: ["tech", "technology", "science", "ai", "digital"] },
  { slug: "health", label: "Health", topics: ["health", "medicine", "public-health"] },
  { slug: "society", label: "Society", topics: ["society", "education", "civic", "transport", "culture", "housing", "rights"] },
  { slug: "sport", label: "Sport", topics: ["sport", "sports", "football", "cricket"] },
];

export const categoryOf = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
export const inCategory = (card: Pick<FeedItem, "topics">, cat: Category) => card.topics.some((t) => cat.topics.includes(t.toLowerCase()));
/** First matching category for a story (used for topic rails and chips). */
export const primaryCategory = (card: Pick<FeedItem, "topics">) => CATEGORIES.find((c) => inCategory(card, c));

// ---------- ordering ----------

export const newestFirst = (a: FeedItem, b: FeedItem) => b.updatedAt.localeCompare(a.updatedAt);

/** Spotlight score: recency x evidence x video availability. */
export function spotlightScore(c: CardItem, now = Date.now()): number {
  const hours = Math.max(0, (now - new Date(c.updatedAt).getTime()) / 3_600_000);
  const recency = 1 / (1 + hours / 12);
  const ev = c.evidence;
  const evidence = 1 + Math.min(ev.supported, 6) * 0.08 - Math.min(ev.contested + ev.unverified, 6) * 0.02;
  const video = c.videos.length ? 1.6 : 1;
  return recency * evidence * video;
}
