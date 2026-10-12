import { MODELS, numbersIn } from "@openlens/config";
import type { Assessment, Claim, QaFlag, SourceRecord } from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";
import { validateAssessment, validateClaims } from "./validators.js";

export { numbersIn };

/** Numbers in `text` that do not appear anywhere in the reference texts (claims + passages). */
export function unknownNumbers(text: string, reference: string[]): string[] {
  const known = new Set(reference.flatMap(numbersIn));
  return [...new Set(numbersIn(text))].filter((n) => !known.has(n));
}

const Risk = z.object({
  riskTier: z.enum(["low", "sensitive"]),
  reasons: z.array(z.string()),
});

const Support = z.object({
  results: z.array(z.object({ claimId: z.string(), supported: z.boolean(), why: z.string() })),
});

const RISK_SYSTEM = `Classify editorial risk. "sensitive" if the story involves any of: elections, armed conflict, communal/religious tension, allegations against identifiable people, deaths or injuries, public safety emergencies, health claims, or legal accusations. Otherwise "low".`;
const SUPPORT_SYSTEM = `You verify citations. For each claim, decide whether the quoted passage, read in context, actually supports the claim as worded (not stronger, not broader). Be strict about qualifiers, numbers, dates and attribution.`;

export async function qaCheck(
  storyTitle: string,
  claims: Claim[],
  sources: SourceRecord[],
  assessment: Assessment | null,
  opts: { grounded: boolean },
): Promise<{ flags: QaFlag[]; riskTier: "low" | "sensitive"; metas: RunMeta[] }> {
  const flags: QaFlag[] = [];
  const metas: RunMeta[] = [];

  for (const v of validateClaims(claims, sources)) flags.push({ severity: "block", kind: v.kind, detail: v.detail });
  if (assessment) {
    for (const v of validateAssessment(assessment, claims))
      flags.push({ severity: v.kind === "unsupported_established" ? "block" : "warn", kind: v.kind, detail: v.detail, target: "assessment" });
    const ref = [...claims.map((c) => c.text), ...claims.flatMap((c) => c.evidence.map((e) => e.passage))];
    for (const s of assessment.sections) {
      const bad = unknownNumbers(s.text, ref);
      if (bad.length) flags.push({ severity: "block", kind: "number_mismatch", detail: `${s.kind}: ${bad.join(", ")}`, target: `assessment:${s.kind}` });
    }
  }
  if (!opts.grounded)
    flags.push({ severity: "warn", kind: "ungrounded_research", detail: "Research ran without Search grounding; context limited to the source pack." });

  const risk = await generateStructured({ model: MODELS.fast, system: RISK_SYSTEM, schema: Risk, prompt: `${storyTitle}\n\n${claims.map((c) => c.text).join("\n")}` });
  metas.push(risk.meta);
  if (risk.data.riskTier === "sensitive")
    flags.push({ severity: "info", kind: "sensitive_story", detail: `Mandatory human approval: ${risk.data.reasons.join("; ")}` });

  const support = await generateStructured({
    model: MODELS.reasoning,
    system: SUPPORT_SYSTEM,
    schema: Support,
    prompt: claims.map((c) => `${c.id}: CLAIM "${c.text}" | PASSAGE "${c.evidence[0]?.passage}"`).join("\n"),
  });
  metas.push(support.meta);
  for (const r of support.data.results)
    if (!r.supported) flags.push({ severity: "warn", kind: "passage_does_not_support", detail: `${r.claimId}: ${r.why}`, target: `claim:${r.claimId}` });

  return { flags, riskTier: risk.data.riskTier, metas };
}
