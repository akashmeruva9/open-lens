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
- At most 12 claims: the most newsworthy, concrete ones (who/what/when/where/numbers); skip background boilerplate.
${ENGLISH_DESK}`;

const CONCURRENCY = 6;
const MAX_CLAIMS_PER_SOURCE = 12;

export async function extractClaims(
  storyId: string,
  sources: SourceRecord[],
): Promise<{ claims: Claim[]; dropped: number; metas: RunMeta[] }> {
  // Sources are independent: extract a few at a time, keeping source order in the ledger.
  const results: { claims: ExtractedClaims["claims"]; meta: RunMeta }[] = new Array(sources.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sources.length) }, async () => {
      for (let i = next++; i < sources.length; i = next++) {
        const src = sources[i]!;
        const { data, meta } = await generateStructured({
          model: MODELS.fast,
          system: SYSTEM,
          schema: ExtractedClaims,
          prompt: `SOURCE ID: ${src.id}\nPUBLISHER: ${src.publisher}\nTITLE: ${src.title}\n\nTEXT:\n${src.text}`,
        });
        results[i] = { claims: data.claims.slice(0, MAX_CLAIMS_PER_SOURCE).map((c) => ({ ...c, sourceId: src.id })), meta };
      }
    }),
  );
  const metas = results.map((r) => r.meta);
  const raw: ExtractedClaims["claims"] = results.flatMap((r) => r.claims);

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
