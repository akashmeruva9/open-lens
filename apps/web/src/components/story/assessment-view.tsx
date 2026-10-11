"use client";
import type { Assessment } from "@openlens/schemas";
import { IconSparkle } from "@/components/ui/icons";
import { ASSESSMENT, ASSESSMENT_ORDER } from "@/lib/meta";
import { ClaimRefs } from "./claim-ref";

const ACCENT: Record<string, string> = {
  established: "--ev-supported",
  attributed: "--ev-attributed",
  contested: "--ev-contested",
  unknown: "--ev-unverified",
  implications: "--ink-3",
  would_change: "--ink-3",
};

export function AssessmentView({ assessment, stale }: { assessment: Assessment; stale: boolean }) {
  const sections = [...assessment.sections].sort((a, b) => ASSESSMENT_ORDER.indexOf(a.kind) - ASSESSMENT_ORDER.indexOf(b.kind));
  return (
    <section aria-labelledby="assessment-title" className="mt-10">
      <p className="eyebrow">Assessment</p>
      <h2 id="assessment-title" className="font-serif text-2xl font-semibold tracking-tight">What we can say</h2>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
        <IconSparkle size={12} /> AI-drafted, editor-reviewed. Every statement cites ledger claims. No numeric truth score.
        {stale ? <span className="font-semibold text-[var(--st-warn)]"> · Ledger updated since this was written</span> : null}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {sections.map((s, i) => {
          const meta = ASSESSMENT[s.kind];
          return (
            <div key={`${s.kind}-${i}`} className="card relative overflow-hidden p-4">
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: `var(${ACCENT[s.kind] ?? "--ink-3"})` }} />
              <dt className="text-sm font-semibold text-ink">{meta?.label ?? s.kind}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
                {s.text} <ClaimRefs ids={s.claimIds} className="ml-0.5 align-middle" />
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
