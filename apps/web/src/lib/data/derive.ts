// Pure helpers that derive read models from a StoryBundle.
import type { FeedItem, OutputRecord, StoryBundle } from "@openlens/schemas";

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

/**
 * Outputs affected by a change to `claimIds`: direct citations, then anything that
 * transitively dependsOn an affected output (script -> video -> yt_meta ...).
 */
export function impactedOutputIds(outputs: OutputRecord[], claimIds: string[]): string[] {
  const hit = new Set(outputs.filter((o) => o.claimIds.some((c) => claimIds.includes(c))).map((o) => o.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of outputs) {
      if (!hit.has(o.id) && o.dependsOn.some((d) => hit.has(d))) {
        hit.add(o.id);
        grew = true;
      }
    }
  }
  return outputs.filter((o) => hit.has(o.id)).map((o) => o.id);
}

/** Pipeline stages, in order, for the studio progress view. */
const STAGES = ["intake", "cluster", "claims", "research", "corroborate", "lens", "synthesize", "qa", "localize", "social", "tts", "render"];

export const PIPELINE_STAGES = STAGES;

/** Pipeline progress (0..1) implied by a story status when no live SSE is available. */
export function statusProgress(status: string): number {
  switch (status) {
    case "draft": return 0;
    case "researching": return 0.45;
    case "in_review": return 0.8;
    case "approved": return 0.92;
    default: return 1;
  }
}
