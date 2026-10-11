// Model registry: never hard-code model ids in agent code. Verify names/quotas on Day 0.
export const MODELS = {
  reasoning: process.env.MODEL_REASONING ?? "gemini-3.8-flash",
  fast: process.env.MODEL_FAST ?? "gemini-3.8-flash",
  tts: process.env.MODEL_TTS ?? "gemini-3.8-flash-tts",
  embed: process.env.MODEL_EMBED ?? "gemini-embedding-2",
} as const;

export const LANGUAGES = {
  en: { name: "English", tier: ["national", "international"] },
  hi: { name: "Hindi", tier: ["national"] },
  te: { name: "Telugu", tier: ["regional"] },
  es: { name: "Spanish", tier: ["international"] },
} as const;
export type LangCode = keyof typeof LANGUAGES;

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

// Fictional, disclosed synthetic presenters. Never modelled on a real journalist.
export const PRESENTERS = {
  "arjun-en": { name: "Arjun", lang: "en", voice: "Charon", style: "calm, clear national-news anchor" },
  "maya-intl": { name: "Maya", lang: "en", voice: "Aoede", style: "warm international explainer host" },
  "kavya-hi": { name: "Kavya", lang: "hi", voice: "Kore", style: "crisp Hindi news anchor, measured pace" },
  "priya-te": { name: "Priya", lang: "te", voice: "Leda", style: "friendly Telugu regional news presenter" },
  "lucia-es": { name: "Lucía", lang: "es", voice: "Aoede", style: "neutral Latin American Spanish news host" },
} as const;
export type PresenterId = keyof typeof PRESENTERS;

/** Which language/presenter each YouTube tier publishes. */
export const YT_TIERS = [
  { tier: "regional", lang: "te", presenter: "priya-te" },
  { tier: "national", lang: "hi", presenter: "kavya-hi" },
  { tier: "national", lang: "en", presenter: "arjun-en" },
  { tier: "international", lang: "es", presenter: "lucia-es" },
] as const;

export const AI_DISCLOSURE: Record<string, string> = {
  en: "AI-generated presenter and narration. Facts sourced and reviewed by OpenLens editors.",
  hi: "एआई-जनित प्रस्तुतकर्ता और आवाज़। तथ्य OpenLens संपादकों द्वारा स्रोत-सत्यापित।",
  te: "AI ద్వారా రూపొందించిన ప్రెజెంటర్ మరియు వ్యాఖ్యానం. వాస్తవాలను OpenLens ఎడిటర్లు పరిశీలించారు.",
  es: "Presentador y narración generados por IA. Hechos verificados por editores de OpenLens.",
};

export const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? "https://openlens.app";
