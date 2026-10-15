"use client";
import type { StageEvent } from "@/lib/data/browser";
import { PIPELINE_STAGES, statusProgress } from "@/lib/data/derive";

/**
 * Stage-by-stage progress. Uses live SSE stage events when present, otherwise
 * infers progress from the story status.
 */
export function PipelineProgress({ status, stages, compact = false }: { status: string; stages: Record<string, StageEvent>; compact?: boolean }) {
  const live = Object.keys(stages).length > 0;
  const inferredDone = Math.round(statusProgress(status) * PIPELINE_STAGES.length);
  const states = PIPELINE_STAGES.map((s, i) => {
    if (live) return stages[s]?.status ?? "pending";
    if (i < inferredDone) return "done";
    if (i === inferredDone && status === "researching") return "started";
    return "pending";
  });
  const done = states.filter((s) => s === "done").length;
  const pctDone = Math.round((done / PIPELINE_STAGES.length) * 100);
  const running = PIPELINE_STAGES[states.findIndex((s) => s === "started")];

  return (
    <div className={compact ? "w-full" : ""}>
      <div className="flex gap-0.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctDone}
        aria-label={`Pipeline ${pctDone}% complete${running ? `, running ${running}` : ""}`}>
        {PIPELINE_STAGES.map((s, i) => (
          <span key={s} title={`${s}: ${states[i]}`}
            className={`h-1.5 flex-1 rounded-full ${states[i] === "started" ? "pulse-dot" : ""}`}
            style={{
              background:
                states[i] === "done" ? "var(--st-ok)" : states[i] === "started" ? "var(--st-info)" : states[i] === "failed" ? "var(--st-bad)" : "var(--line)",
            }} />
        ))}
      </div>
      {!compact ? (
        <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
          {PIPELINE_STAGES.map((s, i) => (
            <li key={s} className={states[i] === "done" ? "text-ink-2" : states[i] === "started" ? "font-semibold text-ink" : ""}>
              {states[i] === "done" ? "✓ " : states[i] === "started" ? "● " : states[i] === "failed" ? "✕ " : "○ "}
              {s}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-[11px] text-ink-3">{running ? `Running: ${running}` : `${done}/${PIPELINE_STAGES.length} stages`}</p>
      )}
    </div>
  );
}
