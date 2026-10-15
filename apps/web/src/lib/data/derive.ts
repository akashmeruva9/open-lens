// Pure helpers that derive read models from a StoryBundle.
import type { FeedItem, StoryBundle } from "@openlens/schemas";

export function feedItemFromBundle(b: StoryBundle): FeedItem {
  const count = (s: string) => b.claims.filter((c) => c.state === s).length;
  const video = b.outputs.find((o) => o.kind === "video" && o.lang === "en") ?? b.outputs.find((o) => o.kind === "video");
  return {
    id: b.story.id,
    title: b.assessment?.headline || b.story.title,
    summary: b.assessment?.neutralSummary || b.story.summary,
    region: b.story.region,
    topics: b.story.topics,
    languages: b.story.languages,
    status: b.story.status,
    updatedAt: b.story.updatedAt,
    sourceCount: b.sources.length,
    lensesCovered: b.lanes.map((l) => l.lens),
    evidence: { supported: count("supported"), contested: count("contested"), unverified: count("unverified") },
    heroImage: b.story.heroImage,
    videoUrl: typeof video?.payload.mp4Url === "string" ? video.payload.mp4Url : undefined,
    corrected: b.corrections.length > 0,
  };
}
