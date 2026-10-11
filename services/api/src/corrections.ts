import type { Claim, CorrectionEvent, EvidenceState, OutputRecord } from "@openlens/schemas";
import type { StoryRecord } from "./store.js";

export interface ClaimPatch { text?: string; state?: EvidenceState; reason: string }

/** Output ids affected by a set of changed claims, following dependsOn edges transitively. */
export function impactedOutputs(outputs: OutputRecord[], changedClaimIds: string[]): string[] {
  const changed = new Set(changedClaimIds);
  const hit = new Set(outputs.filter((o) => o.claimIds.some((id) => changed.has(id))).map((o) => o.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of outputs) {
      if (!hit.has(o.id) && o.dependsOn.some((d) => hit.has(d))) {
        hit.add(o.id);
        grew = true;
      }
    }
  }
  return outputs.filter((o) => hit.has(o.id)).map((o) => o.id);
}

/**
 * Apply an editor's claim change: bump ledger version, mark only dependent outputs
 * needs_review, flag affected publications for correction, and log the event.
 */
export function applyClaimPatch(
  rec: StoryRecord,
  claimId: string,
  patch: ClaimPatch,
  by: string,
): { rec: StoryRecord; claim: Claim; event: CorrectionEvent } {
  const idx = rec.claims.findIndex((c) => c.id === claimId);
  if (idx < 0) throw Object.assign(new Error(`claim ${claimId} not found`), { status: 404 });
  if (!patch.reason?.trim()) throw Object.assign(new Error("reason is required"), { status: 400 });

  const now = new Date().toISOString();
  const fromVersion = rec.story.version;
  const toVersion = fromVersion + 1;
  const old = rec.claims[idx]!;
  const claim: Claim = {
    ...old,
    text: patch.text ?? old.text,
    state: patch.state ?? old.state,
    stateReason: `Editor: ${patch.reason}`,
    version: old.version + 1,
  };
  const claims = rec.claims.map((c, i) => (i === idx ? claim : c));

  const impacted = new Set(impactedOutputs(rec.outputs, [claimId]));
  const outputs = rec.outputs.map((o) =>
    impacted.has(o.id)
      ? { ...o, status: "needs_review" as const, staleReason: `Claim ${claimId} changed (v${toVersion}): ${patch.reason}`, updatedAt: now }
      : o,
  );
  const publications = rec.publications.map((p) =>
    impacted.has(p.outputId) && p.status === "published" ? { ...p, status: "needs_correction" as const } : p,
  );
  const event: CorrectionEvent = {
    id: `corr-${toVersion}-${Date.now().toString(36)}`,
    storyId: rec.story.id,
    at: now,
    by,
    reason: patch.reason,
    changedClaimIds: [claimId],
    fromVersion,
    toVersion,
    impactedOutputIds: [...impacted],
    impactedPublicationIds: publications.filter((p) => p.status === "needs_correction" && impacted.has(p.outputId)).map((p) => p.id),
  };
  const wasPublic = rec.story.status === "published" || rec.story.status === "corrected";
  return {
    rec: {
      ...rec,
      story: { ...rec.story, version: toVersion, status: wasPublic ? "stale" : rec.story.status, updatedAt: now },
      claims,
      outputs,
      publications,
      corrections: [...rec.corrections, event],
    },
    claim,
    event,
  };
}
