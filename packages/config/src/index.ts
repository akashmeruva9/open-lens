import { CHANNEL_PLAN } from "./japac.js";

export * from "./japac.js";
export * from "./text.js";

// Model registry: never hard-code model ids in agent code. Verify names/quotas on Day 0.
export const MODELS = {
  reasoning: process.env.MODEL_REASONING ?? "gemini-3.8-flash",
  fast: process.env.MODEL_FAST ?? "gemini-3.8-flash",
  tts: process.env.MODEL_TTS ?? "gemini-3.8-flash-tts",
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

export const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? "https://openlens.app";
