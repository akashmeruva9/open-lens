import { MODELS } from "@openlens/config";
import type { Claim, EvidenceState, SourceRecord } from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";

const Relations = z.object({
  groups: z
    .array(
      z.object({
        claimIds: z.array(z.string()).min(1).describe("Claims that assert the same thing, possibly in different words"),
        contradictedBy: z.array(z.string()).describe("Claim ids that materially contradict this group"),
        note: z.string(),
      }),
    )
    .describe("Every claim id must appear in exactly one group"),
});

const SYSTEM = `You are the Corroboration Agent of a transparent newsroom.
Group claims that assert the same proposition (same facts, possibly different wording or sources).
Mark contradictions only when two claims cannot both be true. Differences of emphasis or opinion are NOT contradictions.
Do not judge truth yourself; only relate claims to each other.`;

/** Root source of a source, following derivedFrom (shared press releases are not independent). */
function rootOf(id: string, byId: Map<string, SourceRecord>): string {
  let cur = id;
  const seen = new Set<string>();
  while (byId.get(cur)?.derivedFrom && !seen.has(cur)) {
    seen.add(cur);
    cur = byId.get(cur)!.derivedFrom!;
  }
  return cur;
}

/**
 * Deterministic state rules (the model only proposes groupings):
 * - opinion/allegation/forecast with attribution -> attributed
 * - contradicted by another group -> contested
 * - fact/causal with >= 2 independent roots, or backed by a primary source -> supported
 * - otherwise -> unverified
 */
export function assignStates(
  claims: Claim[],
  sources: SourceRecord[],
  groups: z.infer<typeof Relations>["groups"],
): Claim[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const groupOf = new Map<string, number>();
  groups.forEach((g, i) => g.claimIds.forEach((id) => groupOf.set(id, i)));

  return claims.map((c) => {
    const gi = groupOf.get(c.id);
    const group = gi === undefined ? [c.id] : groups[gi]!.claimIds;
    const contradicted = gi !== undefined && groups[gi]!.contradictedBy.some((id) => claimById.has(id));
    const members = group.map((id) => claimById.get(id)).filter((x): x is Claim => Boolean(x));
    const evidence = members.flatMap((m) => m.evidence);
    const roots = new Set(evidence.map((e) => rootOf(e.sourceId, byId)));
    const hasPrimary = evidence.some((e) => byId.get(e.sourceId)?.sourceType === "primary");

    let state: EvidenceState;
    let reason: string;
    if (c.claimType === "opinion" || c.claimType === "forecast" || (c.claimType === "allegation" && c.attributedTo)) {
      state = "attributed";
      reason = `Attributed to ${c.attributedTo ?? "a named party"}; not independently established.`;
    } else if (contradicted) {
      state = "contested";
      reason = `Contradicted by ${groups[gi!]!.contradictedBy.join(", ")}.`;
    } else if (roots.size >= 2 || hasPrimary) {
      state = "supported";
      reason = hasPrimary ? "Backed by a primary source." : `Reported by ${roots.size} independent sources.`;
    } else {
      state = "unverified";
      reason = "Single source; no independent corroboration yet.";
    }
    // Merge cross-source evidence so the dossier shows every supporting passage.
    const merged = [...new Map(evidence.map((e) => [`${e.sourceId}|${e.passage}`, e])).values()];
    return { ...c, state, stateReason: reason, evidence: merged, independentSourceCount: roots.size };
  });
}

export async function corroborate(
  claims: Claim[],
  sources: SourceRecord[],
): Promise<{ claims: Claim[]; meta: RunMeta }> {
  const list = claims
    .map((c) => `${c.id} [${c.claimType}] ${c.attributedTo ? `(${c.attributedTo}) ` : ""}${c.text} {${c.evidence.map((e) => e.sourceId).join(",")}}`)
    .join("\n");
  const { data, meta } = await generateStructured({
    model: MODELS.reasoning,
    system: SYSTEM,
    schema: Relations,
    prompt: `CLAIMS:\n${list}`,
  });
  return { claims: assignStates(claims, sources, data.groups), meta };
}
