// Hashtags for reach, added at publish time (deterministic, no model call):
//   entities   the story's own names/topics: the agents' Instagram hashtags and YouTube tags for the same language
//   topics     the ledger's topic list mapped to common tags in the post's language
//   region     the market the story is about (e.g. #Japan), when it is not region-wide
//   reach      a couple of broad news tags in the post's language
//   brand      #OpenLens, always
// Each channel gets what it can use: Instagram up to 10, YouTube a line in the description (YouTube shows the first three above
// the title; #Shorts is added for vertical video), Facebook up to 4. A post that already contains a tag is never given it twice.
import { MARKETS, marketOf } from "@openlens/config";
import type { OutputRecord } from "@openlens/schemas";

export interface HashtagContext {
  topics: string[];
  region?: string;
  /** The story's outputs, to read the agents' tags for the same language. */
  siblings: OutputRecord[];
}

const BRAND = "OpenLens";

const TOPIC_TAGS: Record<string, Record<string, string>> = {
  en: { politics: "Politics", elections: "Elections", diplomacy: "Diplomacy", conflict: "Geopolitics", law: "Law", economy: "Economy", business: "Business", climate: "Climate", disaster: "BreakingNews", technology: "Tech", science: "Science", health: "Health", education: "Education", society: "Society", rights: "HumanRights", transport: "Transport", culture: "Culture", sport: "Sports" },
  ja: { politics: "政治", elections: "選挙", diplomacy: "外交", conflict: "国際情勢", law: "法律", economy: "経済", business: "ビジネス", climate: "気候変動", disaster: "防災", technology: "テクノロジー", science: "科学", health: "健康", education: "教育", society: "社会", rights: "人権", transport: "交通", culture: "文化", sport: "スポーツ" },
};

const REACH: Record<string, string[]> = {
  en: ["News", "WorldNews"],
  ja: ["ニュース", "国際ニュース"],
  hi: ["समाचार", "खबर"],
};

const REGION_JA: Record<string, string> = { JP: "日本" };

/** Letters, digits and underscores only; 2 to 30 characters; not all digits. */
export function cleanTag(s: string): string | undefined {
  const t = s.replace(/^#/, "").replace(/[^\p{L}\p{N}_]+/gu, "");
  return t.length >= 2 && t.length <= 30 && !/^\d+$/.test(t) ? t : undefined;
}

const key = (t: string) => t.toLowerCase();
const uniq = (tags: (string | undefined)[], skip: Set<string> = new Set()) => {
  const seen = new Set(skip);
  const out: string[] = [];
  for (const t of tags) {
    if (!t || seen.has(key(t))) continue;
    seen.add(key(t));
    out.push(t);
  }
  return out;
};

function regionTag(region: string | undefined, lang: string): string | undefined {
  if (!region) return undefined;
  const m = marketOf(region);
  if (!m || m === "APAC" || m === "WORLD") return undefined;
  if (lang === "ja" && REGION_JA[m]) return REGION_JA[m];
  return cleanTag((MARKETS as Record<string, { name: string }>)[m]?.name ?? "");
}

/** Candidate tags for one post, most specific first. Without the leading #. */
export function candidateTags(lang: string, ctx: HashtagContext): { entities: string[]; topics: string[]; region?: string; reach: string[] } {
  const same = ctx.siblings.filter((o) => o.lang === lang);
  const ig = same.find((o) => o.kind === "ig_reel")?.payload as { hashtags?: unknown } | undefined;
  const yt = same.find((o) => o.kind === "yt_meta")?.payload as { tags?: unknown } | undefined;
  const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const entities = uniq([...asList(ig?.hashtags), ...asList(yt?.tags)].map(cleanTag), new Set([key(BRAND)]));
  const map = TOPIC_TAGS[lang] ?? TOPIC_TAGS.en!;
  const topics = uniq(ctx.topics.map((t) => map[t]).filter(Boolean).map((t) => cleanTag(t!)), new Set(entities.map(key)));
  return { entities, topics, region: regionTag(ctx.region, lang), reach: (REACH[lang] ?? REACH.en!).map((t) => cleanTag(t)!).filter(Boolean) };
}

/** The hashtags for a channel, as `#tag` strings. */
export function hashtagsFor(output: OutputRecord, ctx: HashtagContext, opts: { vertical?: boolean } = {}): string[] {
  const c = candidateTags(output.lang, ctx);
  const brand = BRAND;
  let tags: string[];
  switch (output.kind) {
    case "ig_reel":
      tags = uniq([...c.entities.slice(0, 5), ...c.topics.slice(0, 2), c.region, ...c.reach.slice(0, 1), brand]).slice(0, 9);
      if (!tags.some((t) => key(t) === key(brand))) tags[tags.length - 1] = brand;
      return tags.map((t) => `#${t}`);
    case "yt_meta":
      // The first three show above the title: two story tags and the brand, then the rest.
      return uniq([...c.entities.slice(0, 2), brand, ...c.topics.slice(0, 2), c.region, ...c.reach.slice(0, 1), ...(opts.vertical ? ["Shorts"] : [])]).slice(0, 8).map((t) => `#${t}`);
    case "fb_post":
      return uniq([...c.entities.slice(0, 2), c.topics[0], brand]).slice(0, 4).map((t) => `#${t}`);
    default:
      return [];
  }
}

const hasTag = (text: string, tag: string) => new RegExp(`(^|[^\\p{L}\\p{N}_])${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(text);

/** The post with hashtags added where they belong. Idempotent: tags already in the text are not added again. */
export function withHashtags(output: OutputRecord, ctx: HashtagContext, opts: { vertical?: boolean } = {}): OutputRecord {
  const tags = hashtagsFor(output, ctx, opts);
  if (!tags.length) return output;
  const payload = { ...(output.payload as Record<string, unknown>) };
  if (output.kind === "ig_reel") {
    const have = (Array.isArray(payload.hashtags) ? payload.hashtags : []).filter((x): x is string => typeof x === "string").map((t) => (t.startsWith("#") ? t : `#${t}`));
    payload.hashtags = uniq([...have, ...tags].map((t) => t.replace(/^#/, ""))).map((t) => `#${t}`).slice(0, 10);
  } else {
    const field = output.kind === "yt_meta" ? "description" : "message";
    const text = typeof payload[field] === "string" ? (payload[field] as string) : "";
    const add = tags.filter((t) => !hasTag(text, t));
    if (add.length) payload[field] = `${text.trimEnd()}\n\n${add.join(" ")}`;
  }
  return { ...output, payload };
}
