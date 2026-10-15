import type { ReactNode } from "react";
import { EVIDENCE, LENS, OUTPUT_STATUS, PUB_STATUS, STORY_STATUS, tone } from "@/lib/meta";

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap";

export function Pill({ toneVar, children, title, className = "" }: { toneVar: string; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`${base} tone ${className}`} style={tone(toneVar)} title={title}>
      {children}
    </span>
  );
}

export function Dot({ toneVar, className = "" }: { toneVar: string; className?: string }) {
  return <span aria-hidden className={`inline-block size-1.5 rounded-full ${className}`} style={{ background: `var(${toneVar})` }} />;
}

export function EvidenceChip({ state, count }: { state: string; count?: number }) {
  const m = EVIDENCE[state] ?? EVIDENCE.unverified;
  return (
    <Pill toneVar={m.tone} title={m.help}>
      <Dot toneVar={m.tone} />
      {count !== undefined ? <span className="tabular-nums">{count}</span> : null}
      {m.label}
    </Pill>
  );
}

/** LIVE / Developing / Corrected: solid --live. */
export function LiveChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className={`${base} bg-live text-white`} title={title}>
      {children}
    </span>
  );
}

/** Auto-published · not editor-reviewed: outline in --ink-3. */
export function AutoPublishedChip() {
  return (
    <span className={`${base} border border-ink-3 text-ink-2`} title="Published automatically by the OpenLens wire; no editor has reviewed it.">
      Auto-published · not editor-reviewed
    </span>
  );
}

/** An automated QA check raised a blocking issue; the story is shown anyway, with this warning. */
export function ChecksFlaggedChip() {
  return (
    <span className={`${base} border border-live text-live`} title="An automated check found a problem, e.g. a claim listed as established without enough support. Read the evidence below with care.">
      Automated checks flagged issues
    </span>
  );
}

/** Neutral topic / market chip. */
export function TopicChip({ children }: { children: ReactNode }) {
  return <span className={`${base} bg-surface text-ink`}>{children}</span>;
}

export function LensChip({ lens, compact = false }: { lens: string; compact?: boolean }) {
  const m = LENS[lens] ?? LENS.unrated;
  return <Pill toneVar={m.tone}>{compact ? m.short : m.label}</Pill>;
}

export function OutputStatusPill({ status }: { status: string }) {
  const m = OUTPUT_STATUS[status] ?? OUTPUT_STATUS.draft;
  return (
    <Pill toneVar={m.tone}>
      <Dot toneVar={m.tone} className={status === "qa" ? "pulse-dot" : ""} />
      {m.label}
    </Pill>
  );
}

export function StoryStatusPill({ status }: { status: string }) {
  const m = STORY_STATUS[status] ?? STORY_STATUS.draft;
  return (
    <Pill toneVar={m.tone}>
      <Dot toneVar={m.tone} className={status === "researching" ? "pulse-dot" : ""} />
      {m.label}
    </Pill>
  );
}

export function PubStatusPill({ status }: { status: string }) {
  const m = PUB_STATUS[status] ?? PUB_STATUS.published;
  return <Pill toneVar={m.tone}>{m.label}</Pill>;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
      {children}
    </span>
  );
}

/** Compact evidence dot-counts for card metadata rows (supported / contested / unverified). */
export function EvidenceDots({ evidence, className = "" }: { evidence: { supported: number; contested: number; unverified: number }; className?: string }) {
  const parts = (["supported", "contested", "unverified"] as const).filter((k) => evidence[k] > 0);
  if (!parts.length) return null;
  const label = parts.map((k) => `${evidence[k]} ${EVIDENCE[k].label.toLowerCase()}`).join(", ");
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={`Claims: ${label}`}>
      <span className="sr-only">Claims: {label}</span>
      {parts.map((k) => (
        <span key={k} aria-hidden className="inline-flex items-center gap-1 tabular-nums">
          <span className="inline-block size-[7px] rounded-full" style={{ background: `var(${EVIDENCE[k].tone})` }} />
          {evidence[k]}
        </span>
      ))}
    </span>
  );
}

/** Proportional evidence bar (used inside poster frames). */
export function EvidenceBar({ evidence, className = "" }: { evidence: { supported: number; contested: number; unverified: number }; className?: string }) {
  const total = evidence.supported + evidence.contested + evidence.unverified;
  if (!total) return null;
  return (
    <span aria-hidden className={`flex h-1 overflow-hidden rounded-full ${className}`}>
      {(["supported", "contested", "unverified"] as const).map((k) =>
        evidence[k] ? <span key={k} style={{ flex: evidence[k], background: `var(${EVIDENCE[k].tone})` }} /> : null,
      )}
    </span>
  );
}
