import { MODELS } from "@openlens/config";
import { ExtractedClaims, type Claim, type SourceRecord } from "@openlens/schemas";
import { ENGLISH_DESK } from "./desk.js";
import { generateStructured, type RunMeta } from "./gemini.js";
import { passageInSource } from "./validators.js";

const SYSTEM = `You are the Claim Extraction Agent of a transparent newsroom.
Convert news reports into atomic, self-contained claims.
Rules:
- One fact/allegation/opinion/forecast per claim. Resolve pronouns so each claim stands alone.
- "passage" MUST be copied verbatim from the given source text. Never paraphrase it.
- If a person or organization asserts something, set attributedTo and use claimType "allegation" or "opinion" as appropriate. Do not state attributed assertions as fact.
- Never add information that is not in the source.
${ENGLISH_DESK}`;

export async function extractClaims(
  storyId: string,
  sources: SourceRecord[],
): Promise<{ claims: Claim[]; dropped: number; metas: RunMeta[] }> {
  const metas: RunMeta[] = [];
  const raw: ExtractedClaims["claims"] = [];

  for (const src of sources) {
    const { data, meta } = await generateStructured({
      model: MODELS.fast,
      system: SYSTEM,
      schema: ExtractedClaims,
      prompt: `SOURCE ID: ${src.id}\nPUBLISHER: ${src.publisher}\nTITLE: ${src.title}\n\nTEXT:\n${src.text}`,
    });
    metas.push(meta);
    raw.push(...data.claims.map((c) => ({ ...c, sourceId: src.id })));
  }

  const byId = new Map(sources.map((s) => [s.id, s]));
  let dropped = 0;
  const claims: Claim[] = [];
  for (const c of raw) {
    const src = byId.get(c.sourceId);
    // Deterministic guard: drop claims whose quoted evidence is not actually in the source.
    if (!src || !passageInSource(c.passage, src)) {
      dropped++;
      continue;
    }
    claims.push({
      id: `c${claims.length + 1}`,
      storyId,
      text: c.text,
      claimType: c.claimType,
      attributedTo: c.attributedTo,
      state: c.claimType === "fact" ? "unverified" : "attributed",
      evidence: [{ sourceId: c.sourceId, passage: c.passage }],
      independentSourceCount: 1,
      version: 1,
    });
  }
  return { claims, dropped, metas };
}
