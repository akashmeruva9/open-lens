"use client";
import type { CorrectionEvent, OutputRecord } from "@openlens/schemas";
import { OutputStatusPill } from "@/components/ui/chips";
import { IconAlert } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { CHANNEL, OUTPUT_KIND } from "@/lib/meta";
import { langName } from "@/lib/format";

/** A CorrectionEvent plus the outputs it impacted (with their current status). */
export function CorrectionResult({ correction, outputs, onOpenChannels }: { correction: CorrectionEvent; outputs: OutputRecord[]; onOpenChannels?: () => void }) {
  const impacted = outputs.filter((o) => correction.impactedOutputIds.includes(o.id));
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "color-mix(in oklab, var(--st-warn) 45%, transparent)", background: "color-mix(in oklab, var(--st-warn) 7%, transparent)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <IconAlert size={15} style={{ color: "var(--st-warn)" }} />
          Correction {correction.id} · v{correction.fromVersion} → v{correction.toVersion}
        </p>
        <span className="text-xs text-ink-3">{correction.by} · <RelTime iso={correction.at} /></span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{correction.reason}</p>
      <p className="mt-1 text-xs text-ink-3">
        Claims changed: {correction.changedClaimIds.join(", ")} · Publications needing correction: {correction.impactedPublicationIds.length}
      </p>
      {impacted.length ? (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {impacted.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs">
              <span className="truncate text-ink-2">
                <span className="font-semibold text-ink">{CHANNEL[o.channel]?.label}</span> · {OUTPUT_KIND[o.kind] ?? o.kind} · {langName(o.lang)}
              </span>
              <OutputStatusPill status={o.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-3">No outputs cite this claim.</p>
      )}
      {impacted.length && onOpenChannels ? (
        <button type="button" onClick={onOpenChannels} className="mt-3 text-xs font-semibold text-ink underline underline-offset-4">
          Review impacted outputs in Channels →
        </button>
      ) : null}
    </div>
  );
}
