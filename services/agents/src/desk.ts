/**
 * OpenLens runs an English desk: every reader-facing field the reasoning agents write is in
 * English, whatever the source language. Verbatim quotes stay in the original language (they are
 * checked against the source text); other languages come later from localized scripts.
 */
export const ENGLISH_DESK = `Language: write every text field in clear English, translating from the source language where needed. Keep personal, place and organization names in their common English form (romanize if there is none). The only exception is "passage", which must stay verbatim in the source's original language.`;

/** Readers are everyday people, not policy experts: every reader-facing text is plain English. */
export const PLAIN_ENGLISH = `Style: simple, everyday English a 14-year-old understands. Short sentences (mostly under 20 words), common words, active voice. Explain any necessary term the first time ("a ceasefire, meaning both sides agree to stop shooting"). Spell out acronyms on first use. No jargon, no clichés, no hype.`;
