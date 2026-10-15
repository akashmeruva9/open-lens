// Scene "beats": what the main frame shows for one spoken line (number card, attributed statement, timeline, sources,
// hero text, illustration, end card). Everything here is deterministic and derived only from the script line, its
// ledger claims and the story timeline:
//  - a number card may only show digits that appear in the spoken line AND verbatim in one of the line's own
//    (non-contested, non-unverified) claim texts; a figure from an *attributed* claim is only shown when the line
//    names who said it, and the card then shows that name (never a bare figure stripped of its attribution);
//  - an attributed-statement card only uses an attribution whose name is spoken in the line;
//  - a timeline card only shows events whose claims are all in a safe state.
// An LLM may later *choose* among these candidates (see pickBeat's `hint`), but it can never add a beat the rules
// would not allow.
import { numbersIn } from "@openlens/config";
import type { ScriptLine } from "@openlens/schemas";

export type BeatKind = "hero" | "number" | "quote" | "timeline" | "sources" | "illustration" | "cta";

export type Beat =
  /** Headline card: first sentence of the line (empty for one-sentence lines: the renderer shows the label big). */
  | { kind: "hero"; headline: string }
  /** Big figure (digits copied from the line and verified against its claim text) + the sentence it comes from. */
  | { kind: "number"; value: string; unit?: string; qualifier?: string; sentence: string; claimId: string; by?: string }
  /** Attributed statement: the sentence that carries an attributed claim + the name as spoken in the line.
   *  Drawn WITHOUT quotation marks, because the sentence is the presenter's paraphrase, not a verbatim quote. */
  | { kind: "quote"; text: string; by: string; claimId: string }
  /** Story timeline window; `active` marks events backed by this line's claims. Event text is in the ledger's language. */
  | { kind: "timeline"; events: { date: string; text: string; active: boolean }[]; showText: boolean }
  // (an event's `text` is "" when it rests on attributed claims the line does not state: the date alone is shown)
  /** Outlets behind the line's claims. */
  | { kind: "sources"; outlets: string[]; count: number; headline: string }
  /** A supplied (AI-generated) illustration, drawn full-bleed with a scrim and a visible label. */
  | { kind: "illustration" }
  /** End card: "Open the research in the OpenLens app" + QR/link. */
  | { kind: "cta"; text: string; url?: string };

export interface BeatClaim {
  text: string;
  attributedTo?: string;
  state?: string;
}

export interface BeatContext {
  /** claimId -> claim text/attribution/state (from the ledger). Without it no number or quote card is ever chosen. */
  claims?: Record<string, BeatClaim>;
  /** Outlet names behind this line's claims. */
  sources?: string[];
  timeline?: { date: string; text: string; claimIds?: string[] }[];
  /** Language the timeline text is written in (the ledger's working language). */
  timelineLang?: string;
  lang: string;
  index: number;
  total: number;
  /** Beat chosen for the previous line (used to avoid monotonous runs). */
  prev?: BeatKind;
  /** Where the end card should point (set from OPENLENS_PUBLIC_URL). */
  ctaUrl?: string;
  /** An illustration image was supplied for this line. */
  illustration?: boolean;
}

/** Hook for an LLM-chosen beat: a preferred kind. It is honoured only if the deterministic rules also allow it. */
export interface BeatHint {
  kind?: BeatKind;
}

const PERCENT_RE = /^\s*(%|percent|per\s?cent|pct|प्रतिशत|फ़ीसदी|फीसदी|శాతం|சதவீத|パーセント|퍼센트|persen|peratus|เปอร์เซ็นต์|phần trăm|porsyento)/iu;
const YEAR_RE = /^(19|20)\d\d$/;
/** A number glued to a date word is a day of month / year, not a figure worth a card. */
const DATE_BEFORE_RE = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*$/i;
const DATE_AFTER_RE = /^\s*(january|february|march|april|may|june|july|august|september|october|november|december|月|日|年|時|时|일|월|년)/iu;
/** English qualifiers kept next to the figure so "less than 1 per cent" never becomes a bare "1%". */
const QUALIFIER_RE = /(less than|more than|fewer than|over|under|around|about|nearly|almost|up to|at least|at most|approximately|roughly|some)\s*$/i;
const CTA_RE = /openlens/i;
const UNSAFE_STATES = new Set(["unverified", "contested", "superseded", "retracted"]);

/** Sentences of a line (works for ।, 。 and Latin punctuation). */
export function sentencesOf(text: string): string[] {
  const seg = [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text)].map((s) => s.segment.trim()).filter(Boolean);
  // ICU does not always break on the Devanagari danda; split those by hand.
  const out = seg.flatMap((s) => s.split(/(?<=।)\s*/u)).map((s) => s.trim()).filter(Boolean);
  return out.length ? out : [text.trim()];
}

interface NumberCandidate { raw: string; norm: string; percent: boolean; dateLike: boolean; qualifier?: string; sentence: string; index: number }

/** Numbers written in the line, with what surrounds each (percent word, date word, qualifier). */
export function numbersInLine(text: string): NumberCandidate[] {
  const t = text.normalize("NFKC");
  const out: NumberCandidate[] = [];
  const sentences = sentencesOf(t);
  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0];
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 24), at);
    const after = t.slice(at + raw.length, at + raw.length + 24);
    // Part of a larger token like "7-2" or "41/2026": skip, it is not a standalone figure.
    if (/[-/–]\s*$/.test(before) || /^[-/–]\d/.test(after)) continue;
    const sentence = sentences.find((s) => s.includes(raw)) ?? sentences[0]!;
    out.push({
      raw, norm: raw.replace(/,/g, ""), percent: PERCENT_RE.test(after),
      dateLike: DATE_BEFORE_RE.test(before) || DATE_AFTER_RE.test(after),
      qualifier: QUALIFIER_RE.exec(before)?.[1]?.toLowerCase(), sentence, index: at,
    });
  }
  return out;
}

const safeClaim = (c: BeatClaim | undefined): c is BeatClaim => Boolean(c) && !UNSAFE_STATES.has(c!.state ?? "");

/** The attribution as spoken in the line (full name, or its last two words), or undefined if the line never names it. */
export function spokenAttribution(lineText: string, attributedTo: string): string | undefined {
  const text = lineText.normalize("NFKC");
  const lower = text.toLowerCase();
  const by = attributedTo.normalize("NFKC").trim();
  const words = by.split(/\s+/);
  const needles = [by, words.slice(-2).join(" ")].filter((n) => [...n].length >= 4).map((n) => n.toLowerCase());
  const hit = needles.find((n) => lower.includes(n));
  if (!hit) return undefined;
  const at = lower.indexOf(hit);
  return text.slice(at, at + hit.length);
}

/** Number card candidate: the most prominent figure in the line that also appears in one of its safe claims. */
export function numberBeat(line: ScriptLine, ctx: BeatContext): Beat | undefined {
  if (!ctx.claims) return undefined;
  const backing = line.claimIds
    .map((id) => [id, ctx.claims![id]] as const)
    .filter(([, c]) => safeClaim(c))
    .map(([id, c]) => {
      // Someone else's figure: usable only if the line says whose it is.
      const by = c!.state === "attributed" && c!.attributedTo ? spokenAttribution(line.text, c!.attributedTo) : undefined;
      return { id, by, ok: c!.state !== "attributed" || Boolean(by), nums: new Set(numbersIn(c!.text)) };
    })
    .filter((b) => b.ok);
  let best: { score: number; cand: NumberCandidate; claimId: string; by?: string } | undefined;
  for (const cand of numbersInLine(line.text)) {
    if (cand.dateLike || (YEAR_RE.test(cand.norm) && !cand.percent)) continue;
    const value = Number(cand.norm);
    if (!Number.isFinite(value) || (!cand.percent && value < 10)) continue;
    const owner = backing.find((b) => b.nums.has(cand.norm));
    if (!owner) continue;
    const score = cand.percent ? 3 : cand.norm.includes(".") || value >= 100 ? 2 : 1;
    if (!best || score > best.score) best = { score, cand, claimId: owner.id, by: owner.by };
  }
  if (!best) return undefined;
  const { cand } = best;
  return { kind: "number", value: cand.raw, unit: cand.percent ? "%" : undefined, qualifier: cand.qualifier, sentence: cand.sentence, claimId: best.claimId, ...(best.by ? { by: best.by } : {}) };
}

/** Attributed-statement candidate: an attributed claim whose attribution name is spoken in this line. */
export function quoteBeat(line: ScriptLine, ctx: BeatContext): Beat | undefined {
  if (!ctx.claims) return undefined;
  const text = line.text.normalize("NFKC");
  for (const id of line.claimIds) {
    const c = ctx.claims[id];
    if (!c?.attributedTo || !safeClaim(c)) continue;
    // Full attribution, then its last two words (drops role words like "Economist"); shown as the script spells it.
    const by = spokenAttribution(text, c.attributedTo);
    if (!by) continue;
    const sentence = sentencesOf(text).find((s) => s.includes(by)) ?? text;
    return { kind: "quote", text: sentence, by, claimId: id };
  }
  return undefined;
}

/** Timeline candidate: at least two safe timeline events are backed by this line's claims. */
export function timelineBeat(line: ScriptLine, ctx: BeatContext): Beat | undefined {
  const all = ctx.timeline ?? [];
  // Never show an event that rests on an unverified/contested claim (its text could state that claim as fact).
  const tl = all
    .filter((e) => (e.claimIds ?? []).length > 0 && (!ctx.claims || (e.claimIds ?? []).every((id) => safeClaim(ctx.claims![id]))))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ids = new Set(line.claimIds);
  const active = tl.map((e) => (e.claimIds ?? []).some((id) => ids.has(id)));
  if (active.filter(Boolean).length < 2) return undefined;
  const MAX = 4;
  const first = active.indexOf(true);
  const start = Math.max(0, Math.min(first, tl.length - MAX));
  // Context rows that rest on someone's attributed claim would lose that attribution in a one-line summary: date only.
  const plain = (e: (typeof tl)[number]) => !ctx.claims || (e.claimIds ?? []).every((id) => ctx.claims![id]?.state === "supported");
  const events = tl.slice(start, start + MAX).map((e, i) => {
    const on = active[start + i]!;
    return { date: formatEventDate(e.date, ctx.lang), text: on || plain(e) ? e.text : "", active: on };
  });
  return { kind: "timeline", events, showText: ctx.lang === (ctx.timelineLang ?? "en") };
}

export function isCtaLine(text: string): boolean {
  return CTA_RE.test(text);
}

/** Hero headline: the first sentence when the line has more than one, else empty (the label is shown big instead). */
function heroHeadline(text: string): string {
  const s = sentencesOf(text);
  return s.length > 1 ? s[0]! : "";
}

/** All beats the rules allow for this line, best first. The hero card is always allowed. */
export function beatCandidates(line: ScriptLine, ctx: BeatContext): Beat[] {
  if (ctx.index === ctx.total - 1 && isCtaLine(line.text)) return [{ kind: "cta", text: line.text, url: ctx.ctaUrl }];
  const out: Beat[] = [];
  if (ctx.illustration) out.push({ kind: "illustration" });
  const n = numberBeat(line, ctx);
  if (n) out.push(n);
  const t = timelineBeat(line, ctx);
  if (t) out.push(t);
  const q = quoteBeat(line, ctx);
  if (q) out.push(q);
  const outlets = [...new Set(ctx.sources ?? [])];
  if (outlets.length >= 2) out.push({ kind: "sources", outlets, count: outlets.length, headline: heroHeadline(line.text) });
  out.push({ kind: "hero", headline: heroHeadline(line.text) });
  return out;
}

/** Deterministic picker: a supplied illustration wins; then a (verified) hint; otherwise avoid repeating the previous
 *  kind; otherwise best-first. */
export function pickBeat(line: ScriptLine, ctx: BeatContext, hint?: BeatHint): Beat {
  const cands = beatCandidates(line, ctx);
  if (cands[0]!.kind === "cta" || cands[0]!.kind === "illustration") return cands[0]!;
  if (hint?.kind) {
    const h = cands.find((b) => b.kind === hint.kind);
    if (h) return h;
  }
  return cands.find((b) => b.kind !== ctx.prev) ?? cands[0]!;
}

/** "2026-09-29" -> "29 Sept 2026" in the video's language; "2020" stays "2020"; anything else is shown as written. */
export function formatEventDate(date: string, lang: string): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(date.trim());
  if (!m) return date;
  if (!m[2]) return m[1]!;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
  try {
    return new Intl.DateTimeFormat(lang, { timeZone: "UTC", year: "numeric", month: "short", ...(m[3] ? { day: "numeric" } : {}) }).format(d);
  } catch {
    return date;
  }
}
