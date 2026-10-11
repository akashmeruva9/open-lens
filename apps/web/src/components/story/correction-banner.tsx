"use client";
import type { CorrectionEvent } from "@openlens/schemas";
import { useState } from "react";
import { IconAlert } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { ClaimRefs } from "./claim-ref";

export function CorrectionBanner({ corrections }: { corrections: CorrectionEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!corrections.length) return null;
  const latest = [...corrections].sort((a, b) => b.at.localeCompare(a.at))[0];
  const rest = corrections.filter((c) => c.id !== latest.id);
  return (
    <aside role="status" aria-label="Correction notice" className="tone mb-6 rounded-xl p-4" style={{ ["--tone" as string]: "var(--st-bad)" }}>
      <div className="flex items-start gap-3">
        <IconAlert size={18} className="mt-0.5 shrink-0" />
        <div className="flex-1 text-ink">
          <p className="text-sm font-semibold" style={{ color: "var(--st-bad)" }}>
            Corrected <RelTime iso={latest.at} /> · ledger v{latest.fromVersion} → v{latest.toVersion}
          </p>
          <p className="mt-1 text-[15px]">{latest.reason}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            Changed claims: <ClaimRefs ids={latest.changedClaimIds} />
            {latest.impactedOutputIds.length ? <span>· {latest.impactedOutputIds.length} linked videos/posts flagged for re-review</span> : null}
          </p>
          {rest.length ? (
            <>
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
                className="mt-2 text-xs font-medium text-ink-2 underline underline-offset-4">
                {expanded ? "Hide" : "Show"} {rest.length} earlier correction{rest.length > 1 ? "s" : ""}
              </button>
              {expanded ? (
                <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
                  {rest.map((c) => (
                    <li key={c.id}>
                      <RelTime iso={c.at} />: {c.reason} <ClaimRefs ids={c.changedClaimIds} className="align-middle" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
