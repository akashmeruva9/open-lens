import type { ReactNode } from "react";
import { EVIDENCE, LENS, OUTPUT_STATUS, PUB_STATUS, STORY_STATUS, tone } from "@/lib/meta";

const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap";

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
    <span className="inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
      {children}
    </span>
  );
}
