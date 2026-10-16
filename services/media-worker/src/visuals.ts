// Automatic realistic backdrops for story beats. For lines that have nothing numeric to show (no number / quote /
// timeline card) one cheap Gemini call proposes a GENERIC, people-free photographable subject per line, and Nano Banana
// renders it ("photo" look, ~US$0.035 each). Everything is non-fatal: a refused, failed or over-budget image just
// means that line keeps its normal card. Images stay labelled "AI-generated illustration" on screen by the renderer.
import type { BeatKind } from "./beats.js";
import { generateIllustration } from "./illustrations.js";
import { askGeminiJson } from "./review.js";

/** Words that must not appear in a subject: people, symbols, violence. The model is asked to avoid them; this enforces it. */
const BANNED = /\b(people|person|man|men|woman|women|child|children|boy|girl|soldier|soldiers|troops|army|military|president|minister|prime minister|leader|crowd|protest\w*|face|faces|police|flag|flags|logo|logos|text|uniform|insignia|blood|corpse|casualt\w*|weapon\w*|gun|guns|rifle|missile|bomb|tank|explosion|fire)\b/i;

/** A subject is usable if it is a short plain description without banned words. */
export function safeSubject(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length < 12 || t.length > 220 || BANNED.test(t)) return undefined;
  return t;
}

/** Lines that would otherwise get a plain card (hero/sources), skipping the last line (end card). At most `max`, spread out. */
export function pickIllustrationLines(kinds: (BeatKind | undefined)[], max: number): number[] {
  const cands = kinds.map((k, i) => ({ k, i })).filter(({ k, i }) => (k === "hero" || k === "sources") && i < kinds.length - 1).map(({ i }) => i);
  if (max <= 0) return [];
  if (cands.length <= max) return cands;
  return Array.from({ length: max }, (_, n) => cands[Math.round((n * (cands.length - 1)) / Math.max(1, max - 1))]!);
}

export interface PlanOptions {
  storyId: string;
  title: string;
  lines: { index: number; text: string }[];
}

/** index -> image file for the lines where a safe subject was produced and an image was generated. Never throws. */
export async function planIllustrations(o: PlanOptions): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  if (!o.lines.length) return out;
  let subjects: { index: number; subject: string }[] = [];
  try {
    const prompt = `You pick neutral stock-photo backdrops for a news video titled "${o.title}".
For each numbered line, write ONE short subject (max 25 words, English) for a generic realistic photograph of objects, equipment, buildings, landscapes or an empty room that relates to the topic of the line.
Strict rules: no people or body parts, no faces, no crowds; no flags, logos, brand names, text or insignia; no violence, weapons, casualties or damage; do not depict a specific real event, place or organisation; do not name real people.
Return JSON only: {"subjects":[{"index":<line number>,"subject":"..."}]}.
Lines:
${o.lines.map((l) => `${l.index}: ${l.text}`).join("\n")}`;
    const r = (await askGeminiJson([{ text: prompt }], `illustration subjects ${o.storyId}`)) as { subjects?: { index: number; subject: string }[] };
    subjects = Array.isArray(r?.subjects) ? r.subjects : [];
  } catch (err) {
    console.warn(`[visuals] subject planning failed: ${String((err as Error).message).slice(0, 160)}`);
    return out;
  }
  const wanted = new Set(o.lines.map((l) => l.index));
  for (const s of subjects) {
    const subject = safeSubject(s.subject);
    if (!wanted.has(s.index) || !subject) continue;
    try {
      const r = await generateIllustration({ storyId: o.storyId, prompt: subject, aspect: "9:16", look: "photo", name: `line${s.index}-${subject}` });
      out[s.index] = r.file;
    } catch (err) {
      console.warn(`[visuals] image for line ${s.index} skipped: ${String((err as Error).message).slice(0, 160)}`);
    }
  }
  return out;
}
