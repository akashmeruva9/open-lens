import type { Assessment, Claim, SourceRecord } from "@openlens/schemas";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A cited passage must appear verbatim (whitespace/case-insensitive) in its source text. */
export function passageInSource(passage: string, source: SourceRecord): boolean {
  return norm(source.text).includes(norm(passage));
}

export interface Violation {
  kind: "missing_source" | "passage_not_found" | "unknown_claim_id" | "uncited_section" | "unsupported_established";
  detail: string;
}

export function validateClaims(claims: Claim[], sources: SourceRecord[]): Violation[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: Violation[] = [];
  for (const c of claims) {
    for (const e of c.evidence) {
      const src = byId.get(e.sourceId);
      if (!src) {
        out.push({ kind: "missing_source", detail: `${c.id} -> ${e.sourceId}` });
      } else if (!passageInSource(e.passage, src)) {
        out.push({ kind: "passage_not_found", detail: `${c.id}: "${e.passage.slice(0, 60)}"` });
      }
    }
  }
  return out;
}

export function validateAssessment(a: Assessment, claims: Claim[]): Violation[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const out: Violation[] = [];
  for (const s of a.sections) {
    if (s.claimIds.length === 0) out.push({ kind: "uncited_section", detail: s.kind });
    for (const id of s.claimIds) {
      const c = byId.get(id);
      if (!c) out.push({ kind: "unknown_claim_id", detail: `${s.kind}: ${id}` });
      // "Established" may only rest on claims the corroboration step marked supported.
      else if (s.kind === "established" && c.state !== "supported")
        out.push({ kind: "unsupported_established", detail: `${id} is ${c.state}` });
    }
  }
  return out;
}

/** Share of assessment sections whose cited claim ids all exist (a simple citation-coverage metric). */
export function citationCoverage(a: Assessment, claims: Claim[]): number {
  if (a.sections.length === 0) return 0;
  const ids = new Set(claims.map((c) => c.id));
  const ok = a.sections.filter((s) => s.claimIds.length > 0 && s.claimIds.every((id) => ids.has(id)));
  return ok.length / a.sections.length;
}
