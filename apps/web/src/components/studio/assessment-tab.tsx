"use client";
import type { StoryBundle } from "@openlens/schemas";
import { Button } from "@/components/ui/button";
import { EvidenceChip, Pill } from "@/components/ui/chips";
import { IconAlert, IconCheck } from "@/components/ui/icons";
import { ASSESSMENT, ASSESSMENT_ORDER } from "@/lib/meta";

/** Review view: each section with its cited claims inline, plus deterministic citation checks. */
export function AssessmentTab({ bundle, onApprove, busy }: { bundle: StoryBundle; onApprove: () => void; busy: boolean }) {
  const a = bundle.assessment;
  if (!a) return <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-3">Synthesis has not produced an assessment yet.</p>;
  const claims = new Map(bundle.claims.map((c) => [c.id, c]));
  const stale = a.ledgerVersion < bundle.story.version;
  const sections = [...a.sections].sort((x, y) => ASSESSMENT_ORDER.indexOf(x.kind) - ASSESSMENT_ORDER.indexOf(y.kind));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="eyebrow">Headline</p>
          <p className="font-serif text-xl font-semibold">{a.headline}</p>
          <p className="mt-1 text-sm text-ink-2">{a.neutralSummary}</p>
          <p className="mt-2 text-xs text-ink-3">
            Written against ledger v{a.ledgerVersion} · current v{bundle.story.version}
            {stale ? <span className="font-semibold text-[var(--st-warn)]"> · stale: re-run synthesis or review</span> : null}
          </p>
        </div>
        <Button variant="primary" onClick={onApprove} disabled={busy || bundle.story.status === "approved" || bundle.story.status === "published"}>
          <IconCheck size={15} /> {bundle.story.status === "approved" || bundle.story.status === "published" ? "Approved" : "Approve story"}
        </Button>
      </div>

      {sections.map((s, i) => {
        const cited = s.claimIds.map((id) => claims.get(id));
        const missing = s.claimIds.filter((id) => !claims.has(id));
        const weak = s.kind === "established" ? cited.filter((c) => c && c.state !== "supported") : [];
        return (
          <section key={`${s.kind}-${i}`} className="card p-4" aria-label={ASSESSMENT[s.kind]?.label}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{ASSESSMENT[s.kind]?.label ?? s.kind}</h3>
              <div className="flex gap-1.5">
                {missing.length ? <Pill toneVar="--st-bad"><IconAlert size={11} /> {missing.length} unknown claim id</Pill> : null}
                {weak.length ? <Pill toneVar="--st-bad"><IconAlert size={11} /> {weak.length} not supported</Pill> : null}
                {!missing.length && !weak.length ? <Pill toneVar="--st-ok"><IconCheck size={11} /> Citations OK</Pill> : null}
              </div>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">{s.text}</p>
            <ul className="mt-3 space-y-1 border-t border-line pt-3">
              {s.claimIds.map((id) => {
                const c = claims.get(id);
                return (
                  <li key={id} className="flex items-start gap-2 text-xs">
                    <code className="mt-0.5 rounded bg-surface-2 px-1 text-ink-3">{id}</code>
                    {c ? (
                      <>
                        <span className="flex-1 text-ink-2">{c.text}</span>
                        <EvidenceChip state={c.state} />
                      </>
                    ) : (
                      <span className="text-[var(--st-bad)]">Not in ledger</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
