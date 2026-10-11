import { MODELS } from "@openlens/config";
import { Assessment, type Claim, type SourceRecord } from "@openlens/schemas";
import { generateStructured, type RunMeta } from "./gemini.js";
import { validateAssessment, type Violation } from "./validators.js";

const SYSTEM = `You are the Editorial Synthesis Agent of a transparent newsroom.
Write an evidence-based assessment using ONLY the provided claims.
Rules:
- Sections: established (ONLY claims whose state is "supported"; if none, say nothing is independently established yet and cite the closest claims under "unknown" instead), attributed (who said what), contested (where sources disagree), unknown (what is missing), implications, would_change (what evidence would change this assessment).
- Every section lists the claimIds it relies on. Use only ids given to you. Every section needs at least one claimId.
- Never introduce numbers that are not in the claims.
- Never present attributed allegations or opinions as established fact.
- No numeric truth scores. State uncertainty plainly. Neutral tone.`;

export async function synthesizeAssessment(
  storyId: string,
  claims: Claim[],
  sources: SourceRecord[],
  ledgerVersion = 1,
): Promise<{ assessment: Assessment; violations: Violation[]; meta: RunMeta }> {
  const ledger = claims
    .map(
      (c) =>
        `${c.id} [${c.claimType}/${c.state}] ${c.attributedTo ? `(${c.attributedTo}) ` : ""}${c.text} {source: ${c.evidence[0]?.sourceId}}`,
    )
    .join("\n");
  const srcList = sources.map((s) => `${s.id}: ${s.publisher} (${s.sourceType}, lens=${s.lens.rating})`).join("\n");

  const { data, meta } = await generateStructured({
    model: MODELS.reasoning,
    system: SYSTEM,
    schema: Assessment,
    temperature: 0.3,
    prompt: `storyId: ${storyId}\nledgerVersion: ${ledgerVersion}\n\nSOURCES:\n${srcList}\n\nCLAIMS:\n${ledger}`,
  });
  const assessment = { ...data, storyId, ledgerVersion };
  return { assessment, violations: validateAssessment(assessment, claims), meta };
}
