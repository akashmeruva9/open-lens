import { MODELS } from "@openlens/config";
import { LensLane, type Claim, type Lens, type SourceRecord } from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";

const LaneDraft = LensLane.omit({ lens: true, sourceIds: true, modelGenerated: true });

const SYSTEM = `You are the Lens Analysis Agent. You describe how a group of outlets FRAMED a story, never whether they are right.
- summary: 1-2 neutral sentences on what this coverage foregrounds.
- emphasizes: 2-4 short phrases.
- doesNotEstablish: 1-3 things this coverage asserts or implies without evidence in the claims given.
- claimIds: the claims this coverage relies on (only ids provided).`;

/** Lens ratings come from the documented outlet table on each source; the model only writes framing text. */
export async function analyzeLenses(
  claims: Claim[],
  sources: SourceRecord[],
): Promise<{ lanes: LensLane[]; metas: RunMeta[] }> {
  const order: Lens[] = ["left", "center", "right", "unrated"];
  const lanes: LensLane[] = [];
  const metas: RunMeta[] = [];
  for (const lens of order) {
    const laneSources = sources.filter((s) => s.lens.rating === lens);
    if (!laneSources.length) continue;
    const ids = new Set(laneSources.map((s) => s.id));
    const laneClaims = claims.filter((c) => c.evidence.some((e) => ids.has(e.sourceId)));
    const { data, meta } = await generateStructured({
      model: MODELS.fast,
      system: SYSTEM,
      schema: LaneDraft,
      prompt: `LENS: ${lens}\nOUTLETS: ${laneSources.map((s) => `${s.publisher}: "${s.title}"`).join("; ")}\n\nCLAIMS FROM THESE OUTLETS:\n${laneClaims
        .map((c) => `${c.id} [${c.claimType}/${c.state}] ${c.text}`)
        .join("\n")}`,
    });
    metas.push(meta);
    const known = new Set(laneClaims.map((c) => c.id));
    lanes.push({
      ...data,
      claimIds: data.claimIds.filter((id) => known.has(id)),
      lens,
      sourceIds: [...ids],
      modelGenerated: true,
    });
  }
  return { lanes, metas };
}

export const _test = { LaneDraft: LaneDraft as z.ZodType };
