import { z } from "zod";

// ---------- Enums ----------
export const Lens = z.enum(["left", "center", "right", "unrated"]);
export type Lens = z.infer<typeof Lens>;
export const SourceType = z.enum(["primary", "reporting", "commentary", "analysis"]);
export const ClaimType = z.enum(["fact", "allegation", "opinion", "forecast", "causal"]);
export const EvidenceState = z.enum(["supported", "contested", "attributed", "unverified", "superseded"]);
export type EvidenceState = z.infer<typeof EvidenceState>;
export const RiskTier = z.enum(["low", "sensitive"]);
export const StoryStatus = z.enum(["draft", "researching", "in_review", "approved", "published", "stale", "corrected"]);
export type StoryStatus = z.infer<typeof StoryStatus>;

// ---------- Sources & claims ----------
export const SourceRecord = z.object({
  id: z.string(),
  storyId: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  language: z.string().default("en"),
  sourceType: SourceType,
  lens: z.object({
    rating: Lens,
    ratingBasis: z.string().optional(),
    modelFraming: z.string().optional(),
  }),
  rights: z.object({ license: z.string(), usage: z.string() }),
  text: z.string(),
  contentHash: z.string().optional(),
  derivedFrom: z.string().optional(),
});
export type SourceRecord = z.infer<typeof SourceRecord>;

export const EvidenceItem = z.object({
  sourceId: z.string(),
  passage: z.string().describe("Exact quote copied verbatim from the source text"),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const Claim = z.object({
  id: z.string(),
  storyId: z.string(),
  text: z.string().describe("One atomic, self-contained statement"),
  claimType: ClaimType,
  attributedTo: z.string().optional(),
  state: EvidenceState,
  evidence: z.array(EvidenceItem).min(1),
  independentSourceCount: z.number().int().nonnegative().default(1),
  stateReason: z.string().optional(),
  version: z.number().int().default(1),
});
export type Claim = z.infer<typeof Claim>;

// What the claim-extraction model returns (before ids/state are assigned)
export const ExtractedClaims = z.object({
  claims: z.array(
    z.object({
      text: z.string(),
      claimType: ClaimType,
      attributedTo: z.string().optional(),
      sourceId: z.string(),
      passage: z.string(),
    }),
  ),
});
export type ExtractedClaims = z.infer<typeof ExtractedClaims>;

// ---------- Research context ----------
export const ContextItem = z.object({
  id: z.string(),
  kind: z.enum(["law", "official_order", "prior_action", "dataset", "similar_case", "background"]),
  title: z.string(),
  summary: z.string(),
  url: z.string().optional(),
  /** Grounding provenance (web results the model actually used). */
  groundingUrls: z.array(z.string()).default([]),
});
export type ContextItem = z.infer<typeof ContextItem>;

export const TimelineEvent = z.object({
  date: z.string().describe("ISO date or human date as written"),
  text: z.string(),
  claimIds: z.array(z.string()).default([]),
  contextIds: z.array(z.string()).default([]),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

// ---------- Lenses ----------
export const LensLane = z.object({
  lens: Lens,
  /** Outlets in this lane (ratings come from the documented table, not the model). */
  sourceIds: z.array(z.string()),
  summary: z.string(),
  emphasizes: z.array(z.string()),
  doesNotEstablish: z.array(z.string()),
  claimIds: z.array(z.string()),
  /** Framing text is model-generated and labelled as such in the UI. */
  modelGenerated: z.literal(true).default(true),
});
export type LensLane = z.infer<typeof LensLane>;

// ---------- Assessment ----------
export const AssessmentKind = z.enum(["established", "attributed", "contested", "unknown", "implications", "would_change"]);
export const AssessmentSection = z.object({
  kind: AssessmentKind,
  text: z.string(),
  claimIds: z.array(z.string()).min(1),
});
export type AssessmentSection = z.infer<typeof AssessmentSection>;

export const Assessment = z.object({
  storyId: z.string(),
  ledgerVersion: z.number().int(),
  headline: z.string(),
  neutralSummary: z.string(),
  sections: z.array(AssessmentSection),
});
export type Assessment = z.infer<typeof Assessment>;

// ---------- QA ----------
export const QaFlag = z.object({
  severity: z.enum(["info", "warn", "block"]),
  kind: z.string(),
  detail: z.string(),
  target: z.string().optional().describe("e.g. assessment:established, output:<id>, claim:<id>"),
});
export type QaFlag = z.infer<typeof QaFlag>;

// ---------- Story ----------
export const Story = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().default(""),
  region: z.string(),
  topics: z.array(z.string()),
  languages: z.array(z.string()).default(["en"]),
  riskTier: RiskTier,
  status: StoryStatus,
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  heroImage: z.string().optional(),
  /** Published by policy (low-risk, no blocking QA flags) before an editor reviewed it. */
  autoPublished: z.boolean().optional(),
  /** Set when the story was created by the automatic wire (ingest cycle). */
  origin: z.enum(["manual", "wire"]).optional(),
});
export type Story = z.infer<typeof Story>;
