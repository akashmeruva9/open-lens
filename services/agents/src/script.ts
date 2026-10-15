import { LANGUAGES, MODELS, PRESENTERS, type LangCode, type PresenterId } from "@openlens/config";
import { ScriptPayload, type Assessment, type Claim } from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";
import { numbersIn } from "@openlens/config";

const SCRIPT_SYSTEM = `You write the script for an OpenLens explainer video (vertical, about 90-120 seconds), SPOKEN by a presenter the way good YouTube news explainers talk: friendly, clear, curious, never preachy.
OpenLens's promise: news sites push one side; we show the whole picture, then give our own evidence-based view.
Structure, one or two lines per part, 8-12 lines in total:
1. HOOK: one line that makes people want to know more (a question or the surprising fact), no clickbait.
2. WHAT HAPPENED: the news in plain words.
3. BACKGROUND: why this is happening, how we got here, why it matters.
4. One line per side (2-3 sides): what this side says and why, attributed ("Ukraine says...", "Critics say..."). Fair to each side.
5. WHAT WE KNOW: what is actually confirmed by independent sources, and what is still unclear.
6. OUR TAKE: OpenLens's view from the explainer's take, said honestly with its confidence ("Our read: ..."). Never tell people whom to vote for.
7. CLOSE: what to watch next, then "Tap Open the research in the OpenLens app to see every source."
Rules:
- Use ONLY the claims, explainer and context given. Every line lists the claimIds it states (background, take and close lines may cite the main claim).
- Attributed claims keep their attribution. Never state contested or unverified claims as fact.
- Each line is 1-3 short spoken sentences, at most about 18 words per sentence; about 220-280 words in total.
- Write for the ear in simple English a 14-year-old follows: contractions, one idea per sentence, no semicolons, no parentheses, no jargon or acronyms without explanation. Numbers as digits with units spelled out ("20 percent").
- Never start two lines the same way. "label" is a 1-3 word on-screen header in CAPS (e.g. WHAT HAPPENED, BACKGROUND, UKRAINE SAYS, CRITICS SAY, WHAT WE KNOW, OUR TAKE, WHAT'S NEXT).`;

/** The explainer as prompt text (absent on stories written before the explainer format). */
function explainerText(a: Assessment): string {
  const e = a.explainer;
  if (!e) return "";
  return [
    "EXPLAINER:",
    `What happened: ${e.whatHappened.text} (${e.whatHappened.claimIds.join(",")})`,
    `Background: ${e.background.text}`,
    ...e.perspectives.map((p) => `Side - ${p.side}: ${p.view} (${p.claimIds.join(",")})`),
    `OpenLens take (${e.take.confidence} confidence): ${e.take.text} (${e.take.claimIds.join(",")})`,
    `What's next: ${e.whatsNext}`,
    "",
    "",
  ].join("\n");
}

export async function buildScript(
  assessment: Assessment,
  claims: Claim[],
  presenter: PresenterId = "maya-apac",
): Promise<{ script: ScriptPayload; meta: RunMeta }> {
  const usable = claims.filter((c) => c.state !== "superseded");
  const { data, meta } = await generateStructured({
    model: MODELS.reasoning,
    system: SCRIPT_SYSTEM,
    schema: ScriptPayload.omit({ backTranslation: true, presenter: true }),
    temperature: 0.4,
    prompt: `HEADLINE: ${assessment.headline}\nSUMMARY: ${assessment.neutralSummary}\n\n${explainerText(assessment)}ASSESSMENT:\n${assessment.sections
      .map((s) => `[${s.kind}] ${s.text} (${s.claimIds.join(",")})`)
      .join("\n")}\n\nAPPROVED CLAIMS:\n${usable.map((c) => `${c.id} [${c.state}] ${c.attributedTo ? `(${c.attributedTo}) ` : ""}${c.text}`).join("\n")}`,
  });
  const known = new Set(usable.map((c) => c.id));
  const lines = data.lines.map((l) => ({ ...l, claimIds: l.claimIds.filter((id) => known.has(id)) }));
  return { script: { ...data, lines, presenter }, meta };
}

const LOCALIZE_SYSTEM = `You localize news scripts for a specific audience. Adapt phrasing so it sounds natural to native speakers of the target language and region — not word-for-word translation.
Write it the way a TV news presenter in that market SPEAKS, not as a written article: natural spoken news register, short sentences (at most about 18 words), common everyday vocabulary instead of heavy formal or Sanskritized/literary words, no stacked clauses (e.g. です・ます style for Japanese, 합니다 style for Korean, Taiwan usage for Traditional Chinese, Singapore usage for Simplified Chinese). Commonly used English loanwords (metro, board, percent) are fine when that is how people actually say it.
Hard rules: keep every fact, qualifier, attribution and uncertainty; keep all numbers, dates and percentages exactly (digits may stay as Western numerals); keep names of people and organizations recognizable; do not add or drop information; keep claimIds per line unchanged and in the same order.`;

const BACK_SYSTEM = `You are a translation QA judge. Translate the localized script back to English literally, then compare it to the original English script line by line.
Score fidelity 0..1 (1 = same facts, qualifiers, attribution and numbers). List concrete issues (missing qualifier, changed number, lost attribution, added claim). Style differences are not issues.`;

const BackCheck = z.object({ backTranslation: z.array(z.string()), score: z.number().min(0).max(1), issues: z.array(z.string()) });

export async function localizeScript(
  source: ScriptPayload,
  lang: LangCode,
  presenter: PresenterId,
  glossary: Record<string, string> = {},
): Promise<{ script: ScriptPayload; metas: RunMeta[] }> {
  const metas: RunMeta[] = [];
  const target = LANGUAGES[lang].name;
  const p = PRESENTERS[presenter];
  const gloss = Object.entries(glossary).map(([k, v]) => `${k} => ${v}`).join("\n");

  let attempt = 0;
  let last: ScriptPayload | undefined;
  while (attempt < 2) {
    attempt++;
    const loc = await generateStructured({
      model: MODELS.fast,
      system: LOCALIZE_SYSTEM,
      schema: ScriptPayload.omit({ backTranslation: true, presenter: true }),
      temperature: 0.3,
      prompt: `TARGET LANGUAGE: ${target}\nPRESENTER STYLE: ${p.style}\n${gloss ? `GLOSSARY (must use):\n${gloss}\n` : ""}${
        last?.backTranslation?.issues.length ? `FIX THESE ISSUES FROM THE PREVIOUS ATTEMPT:\n${last.backTranslation.issues.join("\n")}\n` : ""
      }\nSCRIPT (JSON):\n${JSON.stringify({ title: source.title, lines: source.lines })}`,
    });
    metas.push(loc.meta);
    const lines = loc.data.lines.map((l, i) => ({ ...l, claimIds: source.lines[i]?.claimIds ?? l.claimIds }));

    const back = await generateStructured({
      model: MODELS.fast,
      system: BACK_SYSTEM,
      schema: BackCheck,
      prompt: `ORIGINAL ENGLISH:\n${source.lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n")}\n\nLOCALIZED (${target}):\n${lines
        .map((l, i) => `${i + 1}. ${l.text}`)
        .join("\n")}`,
    });
    metas.push(back.meta);

    // Deterministic number check on top of the judge.
    const srcNums = new Set(source.lines.flatMap((l) => numbersIn(l.text)));
    const locNums = new Set(lines.flatMap((l) => numbersIn(l.text)));
    const missing = [...srcNums].filter((n) => !locNums.has(n));
    const issues = [...back.data.issues, ...missing.map((n) => `number ${n} missing in localized script`)];
    const score = missing.length ? Math.min(back.data.score, 0.6) : back.data.score;

    last = { title: loc.data.title, lines, presenter, backTranslation: { score, issues } };
    if (score >= 0.85 && missing.length === 0) break;
  }
  return { script: last!, metas };
}
