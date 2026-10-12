import { z } from "zod";

export const Channel = z.enum(["app", "youtube", "x", "instagram", "facebook", "whatsapp"]);
export type Channel = z.infer<typeof Channel>;
export const OutputStatus = z.enum(["draft", "qa", "needs_review", "approved", "scheduled", "published", "failed"]);
export type OutputStatus = z.infer<typeof OutputStatus>;
export const OutputKind = z.enum([
  "script", "video", "audio", "carousel", "yt_meta", "x_thread", "ig_reel", "fb_post", "wa_digest",
]);
export type OutputKind = z.infer<typeof OutputKind>;
export const Tier = z.enum(["regional", "national", "international"]);
export type Tier = z.infer<typeof Tier>;

// ---------- Script (the lock point for all media) ----------
export const ScriptLine = z.object({
  label: z.string().describe("Short on-screen section header, e.g. WHAT HAPPENED"),
  text: z.string().describe("One or two spoken sentences"),
  claimIds: z.array(z.string()),
});
export type ScriptLine = z.infer<typeof ScriptLine>;
export const ScriptPayload = z.object({
  title: z.string(),
  lines: z.array(ScriptLine).min(3),
  presenter: z.string().describe("Fictional presenter persona id"),
  backTranslation: z.object({ score: z.number().min(0).max(1), issues: z.array(z.string()) }).optional(),
});
export type ScriptPayload = z.infer<typeof ScriptPayload>;

// ---------- Rendered media ----------
export const VideoPayload = z.object({
  aspect: z.enum(["9:16", "16:9"]),
  mp4Url: z.string(),
  hlsUrl: z.string().optional(),
  captionsVttUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  durationSeconds: z.number(),
  scriptOutputId: z.string(),
});
export type VideoPayload = z.infer<typeof VideoPayload>;
export const AudioPayload = z.object({
  audioUrl: z.string(),
  transcript: z.string(),
  durationSeconds: z.number(),
  scriptOutputId: z.string(),
});
export type AudioPayload = z.infer<typeof AudioPayload>;

/** Hand-off contract: one finished video, everything a distributor (WhatsApp/Instagram/Facebook/X/YouTube) needs.
 *  Produced from the ledger + rendered outputs; consumers must not need to know how the video was made. */
export const RenderedAsset = z.object({
  storyId: z.string(),
  /** Ledger version the video was generated from; a newer ledger means the asset may be stale. */
  ledgerVersion: z.number().int(),
  lang: z.string(),
  tier: Tier.optional(),
  aspect: z.enum(["9:16", "16:9"]),
  mp4Url: z.string(),
  hlsUrl: z.string().optional(),
  captionsVttUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  durationSeconds: z.number(),
  /** Claims the video states; used for correction propagation. */
  claimIds: z.array(z.string()),
  title: z.string(),
  presenter: z.string().optional(),
  /** Always true for generated presenters/narration; distributors must keep the disclosure. */
  aiDisclosure: z.literal(true),
  status: z.string(),
  videoOutputId: z.string(),
});
export type RenderedAsset = z.infer<typeof RenderedAsset>;

// ---------- Channel packages ----------
export const YtMetaPayload = z.object({
  tier: Tier,
  /** Extra-language title/description (YouTube localizations). */
  localizations: z.record(z.string(), z.object({ title: z.string(), description: z.string() })).optional(),
  title: z.string().max(100),
  description: z.string().max(5000),
  tags: z.array(z.string()),
  /** YouTube status.containsSyntheticMedia */
  containsSyntheticMedia: z.boolean(),
  videoOutputId: z.string().optional(),
});
export const XThreadPayload = z.object({
  /** X weighs URLs as 23 chars and CJK/emoji as 2; length is validated with weighted counting, not raw length. */
  posts: z.array(z.string()).min(1).max(8),
  videoOutputId: z.string().optional(),
});
export const IgReelPayload = z.object({
  caption: z.string().max(2200),
  hashtags: z.array(z.string()),
  videoOutputId: z.string().optional(),
});
export const CarouselPayload = z.object({
  slides: z
    .array(z.object({ heading: z.string(), body: z.string(), claimIds: z.array(z.string()), imageUrl: z.string().optional() }))
    .min(3)
    .max(10),
  caption: z.string().max(2200),
});
export const FbPostPayload = z.object({
  message: z.string(),
  link: z.string(),
  videoOutputId: z.string().optional(),
});
export const WaDigestPayload = z.object({
  templateName: z.string(),
  /** Template body parameters, in order. */
  params: z.array(z.string()),
  previewText: z.string().max(1024),
  link: z.string(),
});

export const OutputRecord = z.object({
  id: z.string(),
  storyId: z.string(),
  kind: OutputKind,
  channel: Channel,
  lang: z.string(),
  tier: Tier.optional(),
  claimIds: z.array(z.string()),
  ledgerVersion: z.number().int(),
  status: OutputStatus,
  payload: z.record(z.string(), z.unknown()),
  aiDisclosure: z.boolean().default(false),
  /** Ids of outputs this one is built from (script -> video -> yt_meta). */
  dependsOn: z.array(z.string()).default([]),
  staleReason: z.string().optional(),
  approvedBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OutputRecord = z.infer<typeof OutputRecord>;

export const Publication = z.object({
  id: z.string(),
  storyId: z.string(),
  outputId: z.string(),
  channel: Channel,
  ledgerVersion: z.number().int(),
  mode: z.enum(["live", "dry_run"]),
  externalId: z.string().optional(),
  url: z.string().optional(),
  status: z.enum(["scheduled", "published", "failed", "needs_correction", "corrected", "retracted"]),
  scheduledAt: z.string().optional(),
  publishedAt: z.string(),
  approvedBy: z.string(),
  response: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});
export type Publication = z.infer<typeof Publication>;

export type YtMetaPayload = z.infer<typeof YtMetaPayload>;
export type XThreadPayload = z.infer<typeof XThreadPayload>;
export type IgReelPayload = z.infer<typeof IgReelPayload>;
export type CarouselPayload = z.infer<typeof CarouselPayload>;
export type FbPostPayload = z.infer<typeof FbPostPayload>;
export type WaDigestPayload = z.infer<typeof WaDigestPayload>;
