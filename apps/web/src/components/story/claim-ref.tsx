"use client";
import { EVIDENCE } from "@/lib/meta";
import { useStory } from "./story-context";

/** Compact citation chip ("[3]") that jumps to the claim in the research dossier. */
export function ClaimRef({ id }: { id: string }) {
  const { claimById, claimNo, focusClaim } = useStory();
  const claim = claimById.get(id);
  const n = claimNo.get(id);
  if (!claim || !n) {
    return (
      <span className="inline-flex h-5 items-center rounded border border-dashed border-line px-1 text-[11px] text-ink-3" title="Claim not found in ledger">
        {id}
      </span>
    );
  }
  const ev = EVIDENCE[claim.state] ?? EVIDENCE.unverified;
  return (
    <button
      type="button"
      onClick={() => focusClaim(id)}
      className="tone inline-flex h-5 min-w-5 items-center justify-center rounded px-1 align-[1px] text-[11px] font-semibold tabular-nums hover:brightness-110"
      style={{ ["--tone" as string]: `var(${ev.tone})` }}
      aria-label={`Claim ${n} (${ev.label}): ${claim.text}. Open evidence`}
      title={`${ev.label}: ${claim.text}`}
    >
      {n}
    </button>
  );
}

export function ClaimRefs({ ids, className = "" }: { ids: string[]; className?: string }) {
  if (!ids.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`} aria-label="Citations">
      {ids.map((id) => (
        <ClaimRef key={id} id={id} />
      ))}
    </span>
  );
}
