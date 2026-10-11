import { citationCoverage, validateAssessment, unknownNumbers } from "@openlens/agents";
import type { EvalReport, ScriptPayload } from "@openlens/schemas";
import type { StoryRecord } from "./store.js";

// Optional cost estimate: set PRICE_IN_PER_M / PRICE_OUT_PER_M (USD per million tokens). 0 = not configured.
const PRICE_IN = Number(process.env.PRICE_IN_PER_M ?? 0);
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_M ?? 0);

export function evaluate(rec: StoryRecord): EvalReport {
  const stateCounts: Record<string, number> = {};
  for (const c of rec.claims) stateCounts[c.state] = (stateCounts[c.state] ?? 0) + 1;

  const backTranslation: Record<string, number> = {};
  let numberMismatches = 0;
  const ref = [...rec.claims.map((c) => c.text), ...rec.claims.flatMap((c) => c.evidence.map((e) => e.passage))];
  for (const o of rec.outputs.filter((o) => o.kind === "script")) {
    const p = o.payload as unknown as ScriptPayload;
    if (p.backTranslation) backTranslation[`${o.tier ?? ""}-${o.lang}`] = p.backTranslation.score;
    if (o.lang === "en") numberMismatches += p.lines.reduce((n, l) => n + unknownNumbers(l.text, ref).length, 0);
  }
  if (rec.assessment) numberMismatches += rec.assessment.sections.reduce((n, s) => n + unknownNumbers(s.text, ref).length, 0);

  const promptTokens = rec.runs.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  const outputTokens = rec.runs.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
  return {
    storyId: rec.story.id,
    ledgerVersion: rec.story.version,
    citationCoverage: rec.assessment ? citationCoverage(rec.assessment, rec.claims) : 0,
    claimsTotal: rec.claims.length,
    claimsDroppedUnquoted: rec.claimsDropped,
    stateCounts,
    unsupportedEstablished: rec.assessment
      ? validateAssessment(rec.assessment, rec.claims).filter((v) => v.kind === "unsupported_established").length
      : 0,
    backTranslation,
    numberMismatches,
    qaFlags: rec.qaFlags,
    totalTokens: promptTokens + outputTokens,
    totalLatencyMs: rec.runs.reduce((s, r) => s + r.latencyMs, 0),
    estCostUsd: (promptTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1e6,
  };
}
