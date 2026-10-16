import { CHANNEL_PLAN } from "./japac.js";

export * from "./japac.js";
export * from "./text.js";

// Model registry: never hard-code model ids in agent code. Verify names/quotas on Day 0.
export const MODELS = {
  reasoning: process.env.MODEL_REASONING ?? "gemini-3.8-flash",
  fast: process.env.MODEL_FAST ?? "gemini-3.8-flash",
  tts: process.env.MODEL_TTS ?? "gemini-3.1-flash-tts-preview",
  embed: process.env.MODEL_EMBED ?? "gemini-embedding-2",
} as const;

// Per-channel content limits used by validators
export const CHANNEL_LIMITS = {
  x: { maxChars: 280, maxThreadPosts: 8 },
  instagram: { captionMax: 2200, reelSeconds: [5, 90] },
  facebook: { postMax: 63206 },
  whatsapp: { templateBodyMax: 1024 },
  youtube: { titleMax: 100, descriptionMax: 5000 },
} as const;

// Outlet lens ratings come from a documented table, not model invention.
export const LENS_TABLE_PATH = "data/seed/outlet-ratings.json";

/** @deprecated use CHANNEL_PLAN — kept for older callers. */
export const YT_TIERS = Object.entries(CHANNEL_PLAN).map(([lang, p]) => ({ tier: p.tier, lang, presenter: p.presenter }));

/**
 * rights.usage for third-party news outlets: OpenLens reads the article to extract facts, then
 * publishes only its own writing plus attribution, a link and short quotes. Readers never get the
 * stored article text for these sources.
 */
export const QUOTE_ONLY_USAGE = "link-and-short-quote";
/** Longest verbatim quote shown to readers from a quote-only source. */
export const MAX_QUOTE_CHARS = 300;

/** Story topics the pipeline assigns (the reader's category buttons map onto these). */
export const TOPICS = [
  "politics", "elections", "diplomacy", "conflict", "law", "economy", "business", "climate", "disaster",
  "technology", "science", "health", "education", "society", "rights", "transport", "culture", "sport",
] as const;
export type Topic = (typeof TOPICS)[number];

export const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? "https://openlens.app";
