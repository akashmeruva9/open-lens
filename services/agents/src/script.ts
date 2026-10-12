import { LANGUAGES, MODELS, PRESENTERS, type LangCode, type PresenterId } from "@openlens/config";
import { ScriptPayload, type Assessment, type Claim } from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";
import { numbersIn } from "@openlens/config";

const SCRIPT_SYSTEM = `You write 45-75 second vertical news video scripts for a transparent newsroom.
Structure (4-7 lines): what happened; why / stated reasons; what different sources emphasize; what is established; what remains unknown; call to action "Open the research in the OpenLens app".
Rules:
- Use ONLY the approved claims. Every line lists the claimIds it states (CTA line may cite the main claim).
- Attributed claims must keep attribution ("the Authority says", "critics argue").
- Never state contested or unverified claims as fact. No sensational language.
- Each line is 1-2 short spoken sentences. "label" is a 1-3 word on-screen header in CAPS.`;

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
    prompt: `HEADLINE: ${assessment.headline}\nSUMMARY: ${assessment.neutralSummary}\n\nASSESSMENT:\n${assessment.sections
      .map((s) => `[${s.kind}] ${s.text} (${s.claimIds.join(",")})`)
      .join("\n")}\n\nAPPROVED CLAIMS:\n${usable.map((c) => `${c.id} [${c.state}] ${c.attributedTo ? `(${c.attributedTo}) ` : ""}${c.text}`).join("\n")}`,
  });
  const known = new Set(usable.map((c) => c.id));
  const lines = data.lines.map((l) => ({ ...l, claimIds: l.claimIds.filter((id) => known.has(id)) }));
  return { script: { ...data, lines, presenter }, meta };
}

const LOCALIZE_SYSTEM = `You localize news scripts for a specific audience. Adapt phrasing so it sounds natural to native speakers of the target language and region — not word-for-word translation.
Use the standard written news register of the target market (e.g. です・ます style for Japanese, 합니다 style for Korean, Taiwan usage for Traditional Chinese, Singapore usage for Simplified Chinese).
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
