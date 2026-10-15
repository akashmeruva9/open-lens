import { z } from "zod";
import { Assessment, Claim, ContextItem, LensLane, QaFlag, SourceRecord, Story, TimelineEvent } from "./ledger.js";
import { OutputRecord, Publication } from "./outputs.js";

export const AgentRun = z.object({
  id: z.string(),
  storyId: z.string(),
  stage: z.string(),
  model: z.string(),
  latencyMs: z.number(),
  promptTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  ok: z.boolean(),
  error: z.string().optional(),
  at: z.string(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const CorrectionEvent = z.object({
  id: z.string(),
  storyId: z.string(),
  at: z.string(),
  by: z.string(),
  reason: z.string(),
  changedClaimIds: z.array(z.string()),
  fromVersion: z.number().int(),
  toVersion: z.number().int(),
  impactedOutputIds: z.array(z.string()),
  impactedPublicationIds: z.array(z.string()),
});
export type CorrectionEvent = z.infer<typeof CorrectionEvent>;

export const EvalReport = z.object({
  storyId: z.string(),
  ledgerVersion: z.number().int(),
  citationCoverage: z.number(),
  claimsTotal: z.number(),
  claimsDroppedUnquoted: z.number(),
  stateCounts: z.record(z.string(), z.number()),
  unsupportedEstablished: z.number(),
  backTranslation: z.record(z.string(), z.number()).describe("lang -> fidelity 0..1"),
  numberMismatches: z.number(),
  qaFlags: z.array(QaFlag),
  totalTokens: z.number(),
  totalLatencyMs: z.number(),
  estCostUsd: z.number(),
});
export type EvalReport = z.infer<typeof EvalReport>;

/** Everything a reader app needs to render one story. */
export const StoryBundle = z.object({
  story: Story,
  sources: z.array(SourceRecord),
  claims: z.array(Claim),
  lanes: z.array(LensLane),
  context: z.array(ContextItem),
  timeline: z.array(TimelineEvent),
  assessment: Assessment.nullable(),
  outputs: z.array(OutputRecord),
  publications: z.array(Publication),
  corrections: z.array(CorrectionEvent),
});
export type StoryBundle = z.infer<typeof StoryBundle>;

export const FeedItem = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  region: z.string(),
  topics: z.array(z.string()),
  languages: z.array(z.string()),
  status: Story.shape.status,
  updatedAt: z.string(),
  sourceCount: z.number(),
  lensesCovered: z.array(z.string()),
  evidence: z.object({ supported: z.number(), contested: z.number(), unverified: z.number() }),
  heroImage: z.string().optional(),
  videoUrl: z.string().optional(),
  corrected: z.boolean(),
  lastCorrection: z.object({ at: z.string(), reason: z.string() }).optional(),
  autoPublished: z.boolean().optional(),
  /** Approved/published videos for cards (vertical first): lets clients show duration, language and thumbnail. */
  videos: z
    .array(
      z.object({
        lang: z.string(),
        aspect: z.enum(["9:16", "16:9"]).optional(),
        durationSeconds: z.number().optional(),
        thumbnailUrl: z.string().optional(),
        mp4Url: z.string().optional(),
        hlsUrl: z.string().optional(),
        aiPresenter: z.boolean(),
      }),
    )
    .optional(),
});
export type FeedItem = z.infer<typeof FeedItem>;

/** Server-sent event payloads from GET /stories/:id/events */
export const StoryEventMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: z.string(), status: z.enum(["started", "done", "failed"]), detail: z.string().optional() }),
  z.object({ type: z.literal("output"), outputId: z.string(), status: z.string() }),
  z.object({ type: z.literal("correction"), correctionId: z.string() }),
  z.object({ type: z.literal("publication"), publicationId: z.string(), status: z.string() }),
]);
export type StoryEventMsg = z.infer<typeof StoryEventMsg>;
