import type { CSSProperties } from "react";

export const tone = (cssVar: string): CSSProperties => ({ ["--tone" as string]: `var(${cssVar})` }) as CSSProperties;

export const EVIDENCE: Record<string, { label: string; tone: string; help: string }> = {
  supported: { label: "Supported", tone: "--ev-supported", help: "Backed by the cited source passage(s), with independent corroboration where available." },
  contested: { label: "Contested", tone: "--ev-contested", help: "Sources disagree, or the claim is disputed by a named party." },
  attributed: { label: "Attributed", tone: "--ev-attributed", help: "Reported as what someone said or claimed; OpenLens has not independently established it." },
  unverified: { label: "Unverified", tone: "--ev-unverified", help: "Single source with no independent corroboration yet." },
  superseded: { label: "Superseded", tone: "--ev-superseded", help: "Replaced by newer information in the ledger." },
};

export const LENS: Record<string, { label: string; tone: string; short: string }> = {
  left: { label: "Left-leaning outlets", short: "Left", tone: "--lens-left" },
  center: { label: "Centre outlets", short: "Centre", tone: "--lens-center" },
  right: { label: "Right-leaning outlets", short: "Right", tone: "--lens-right" },
  unrated: { label: "Unrated / primary", short: "Unrated", tone: "--lens-unrated" },
};
export const LENS_ORDER = ["left", "center", "right", "unrated"];

export const OUTPUT_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "--st-muted" },
  qa: { label: "In QA", tone: "--st-info" },
  needs_review: { label: "Needs review", tone: "--st-warn" },
  approved: { label: "Approved", tone: "--st-ok" },
  scheduled: { label: "Scheduled", tone: "--st-info" },
  published: { label: "Published", tone: "--st-ok" },
  failed: { label: "Failed", tone: "--st-bad" },
};

export const STORY_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "--st-muted" },
  researching: { label: "Researching", tone: "--st-info" },
  in_review: { label: "In review", tone: "--st-warn" },
  approved: { label: "Approved", tone: "--st-ok" },
  published: { label: "Published", tone: "--st-ok" },
  stale: { label: "Stale", tone: "--st-warn" },
  corrected: { label: "Corrected", tone: "--st-bad" },
};

export const PUB_STATUS: Record<string, { label: string; tone: string }> = {
  published: { label: "Published", tone: "--st-ok" },
  failed: { label: "Failed", tone: "--st-bad" },
  needs_correction: { label: "Needs correction", tone: "--st-warn" },
  corrected: { label: "Corrected", tone: "--st-info" },
  retracted: { label: "Retracted", tone: "--st-muted" },
};

export const ASSESSMENT: Record<string, { label: string; blurb: string }> = {
  established: { label: "What is established", blurb: "Supported by cited evidence." },
  attributed: { label: "What is attributed", blurb: "Said or claimed by named parties." },
  contested: { label: "What is contested", blurb: "Where sources or parties disagree." },
  unknown: { label: "What we don't know", blurb: "Open questions the evidence does not answer." },
  implications: { label: "Why it matters", blurb: "Likely consequences, as reported." },
  would_change: { label: "What would change this", blurb: "Evidence that would update this assessment." },
};
export const ASSESSMENT_ORDER = ["established", "attributed", "contested", "unknown", "implications", "would_change"];

export const CHANNEL: Record<string, { label: string }> = {
  app: { label: "OpenLens app" },
  youtube: { label: "YouTube" },
  x: { label: "X" },
  instagram: { label: "Instagram" },
  facebook: { label: "Facebook" },
  whatsapp: { label: "WhatsApp" },
};

export const OUTPUT_KIND: Record<string, string> = {
  script: "Script",
  video: "Video",
  audio: "Audio",
  carousel: "Carousel",
  yt_meta: "YouTube package",
  x_thread: "X thread",
  ig_reel: "Instagram Reel",
  fb_post: "Facebook post",
  wa_digest: "WhatsApp digest",
};

export const CONTEXT_KIND: Record<string, string> = {
  law: "Law",
  official_order: "Official order",
  prior_action: "Prior action",
  dataset: "Dataset",
  similar_case: "Similar case",
  background: "Background",
};
