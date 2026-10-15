/**
 * OpenLens runs an English desk: every reader-facing field the reasoning agents write is in
 * English, whatever the source language. Verbatim quotes stay in the original language (they are
 * checked against the source text); other languages come later from localized scripts.
 */
export const ENGLISH_DESK = `Language: write every text field in clear English, translating from the source language where needed. Keep personal, place and organization names in their common English form (romanize if there is none). The only exception is "passage", which must stay verbatim in the source's original language.`;
