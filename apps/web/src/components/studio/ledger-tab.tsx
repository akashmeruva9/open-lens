"use client";
import type { CorrectionEvent, StoryBundle } from "@openlens/schemas";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EvidenceChip, LensChip, Tag } from "@/components/ui/chips";
import { titleCase } from "@/lib/format";
import { ClaimEditor, type ClaimEdit } from "./claim-editor";
import { CorrectionResult } from "./correction-result";

export function LedgerTab({
  bundle, onPatch, lastCorrection, onOpenChannels,
}: {
  bundle: StoryBundle;
  onPatch: (claimId: string, patch: ClaimEdit) => Promise<CorrectionEvent>;
  lastCorrection: CorrectionEvent | null;
  onOpenChannels: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const src = new Map(bundle.sources.map((s) => [s.id, s]));
  const usage = (claimId: string) => bundle.outputs.filter((o) => o.claimIds.includes(claimId)).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-labelledby="ledger-claims">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="ledger-claims" className="text-lg font-semibold">Claims <span className="text-sm font-normal text-ink-3">({bundle.claims.length})</span></h2>
          <p className="text-xs text-ink-3">Edits bump the ledger version and flag every dependent output.</p>
        </div>
        {lastCorrection ? (
          <div className="mb-4">
            <CorrectionResult correction={lastCorrection} outputs={bundle.outputs} onOpenChannels={onOpenChannels} />
          </div>
        ) : null}
        <ol className="space-y-2">
          {bundle.claims.map((c, i) => (
            <li key={c.id} className="card p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold tabular-nums text-ink-2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-ink">{c.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                    <EvidenceChip state={c.state} />
                    <Tag>{titleCase(c.claimType)}</Tag>
                    {c.attributedTo ? <span>by {c.attributedTo}</span> : null}
                    <span>· {c.evidence.map((e) => src.get(e.sourceId)?.publisher ?? e.sourceId).join(", ")}</span>
                    <span>· {c.independentSourceCount} indep.</span>
                    <span>· v{c.version}</span>
                    <span>· used by {usage(c.id)} output{usage(c.id) === 1 ? "" : "s"}</span>
                  </div>
                  {c.stateReason ? <p className="mt-1 text-xs italic text-ink-3">Last change: {c.stateReason}</p> : null}
                </div>
                {editing !== c.id ? (
                  <Button size="sm" onClick={() => setEditing(c.id)} aria-label={`Edit claim ${i + 1}`}>Edit</Button>
                ) : null}
              </div>
              {editing === c.id ? (
                <div className="mt-3">
                  <ClaimEditor
                    claim={c}
                    onCancel={() => setEditing(null)}
                    onSubmit={async (patch) => {
                      await onPatch(c.id, patch);
                      setEditing(null);
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <aside className="space-y-6">
        <section aria-labelledby="corr-log">
          <h2 id="corr-log" className="mb-2 text-lg font-semibold">Correction log</h2>
          {bundle.corrections.length ? (
            <ol className="space-y-2">
              {bundle.corrections.map((c) => (
                <li key={c.id} className="card p-3 text-sm">
                  <p className="font-medium text-ink">v{c.fromVersion} → v{c.toVersion} · {c.changedClaimIds.join(", ")}</p>
                  <p className="text-ink-2">{c.reason}</p>
                  <p className="mt-1 text-xs text-ink-3">{c.by} · {new Date(c.at).toLocaleString()} · {c.impactedOutputIds.length} outputs flagged</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-3">No corrections yet.</p>
          )}
        </section>
        <section aria-labelledby="ledger-sources">
          <h2 id="ledger-sources" className="mb-2 text-lg font-semibold">Sources</h2>
          <ul className="space-y-2">
            {bundle.sources.map((s) => (
              <li key={s.id} className="card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{s.publisher}</span>
                  <LensChip lens={s.lens.rating} compact />
                  <Tag>{titleCase(s.sourceType)}</Tag>
                </div>
                <p className="mt-1 text-xs text-ink-3">{s.title} · basis: {s.lens.ratingBasis ?? "n/a"} · {s.rights.license}</p>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
