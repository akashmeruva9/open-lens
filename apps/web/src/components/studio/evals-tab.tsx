"use client";
import type { AgentRun, EvalReport } from "@openlens/schemas";
import type { ReactNode } from "react";
import { Pill } from "@/components/ui/chips";
import { langName, pct } from "@/lib/format";
import { EVIDENCE } from "@/lib/meta";

const SEV: Record<string, string> = { info: "--st-info", warn: "--st-warn", block: "--st-bad" };

export function EvalsTab({ report, runs, loading }: { report: EvalReport | null; runs: AgentRun[] | null; loading: boolean }) {
  if (!report) return <p className="py-10 text-center text-sm text-ink-3">{loading ? "Computing evals…" : "No eval report yet."}</p>;
  const total = Object.values(report.stateCounts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Citation coverage" value={pct(report.citationCoverage)} ok={report.citationCoverage >= 0.95} hint="Target ≥ 95% of assessment/script units cite a valid claim" />
        <Tile label="Unsupported in “established”" value={String(report.unsupportedEstablished)} ok={report.unsupportedEstablished === 0} hint="Claims in the established section that are not supported" />
        <Tile label="Number mismatches" value={String(report.numberMismatches)} ok={report.numberMismatches === 0} hint="Numbers in outputs not found in cited claims" />
        <Tile label="Claims" value={String(report.claimsTotal)} hint={`${report.claimsDroppedUnquoted} dropped for missing verbatim quote`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Claim evidence states">
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img"
            aria-label={Object.entries(report.stateCounts).map(([s, n]) => `${n} ${s}`).join(", ")}>
            {Object.entries(report.stateCounts).map(([s, n]) => (
              <span key={s} style={{ width: `${(n / total) * 100}%`, background: `var(${EVIDENCE[s]?.tone ?? "--ink-3"})` }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
            {Object.entries(report.stateCounts).map(([s, n]) => (
              <li key={s} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: `var(${EVIDENCE[s]?.tone ?? "--ink-3"})` }} />
                <span className="text-ink-2">{EVIDENCE[s]?.label ?? s}</span>
                <span className="ml-auto tabular-nums font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Back-translation fidelity">
          <ul className="space-y-2">
            {Object.entries(report.backTranslation).map(([lang, score]) => (
              <li key={lang} className="grid grid-cols-[90px_1fr_44px] items-center gap-2 text-sm">
                <span className="text-ink-2">{langName(lang)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full" style={{ width: pct(score), background: score >= 0.9 ? "var(--st-ok)" : score >= 0.8 ? "var(--st-warn)" : "var(--st-bad)" }} />
                </span>
                <span className="text-right tabular-nums font-semibold">{pct(score)}</span>
              </li>
            ))}
            {!Object.keys(report.backTranslation).length ? <li className="text-sm text-ink-3">No localized scripts yet.</li> : null}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">Gemini translates each localized script back to English; a judge scores agreement with the approved script.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={`QA flags (${report.qaFlags.length})`}>
          {report.qaFlags.length ? (
            <ul className="space-y-1.5">
              {report.qaFlags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Pill toneVar={SEV[f.severity] ?? "--st-muted"}>{f.severity}</Pill>
                  <span className="flex-1 text-ink-2"><span className="font-medium text-ink">{f.kind}</span>: {f.detail}</span>
                  {f.target ? <code className="text-[11px] text-ink-3">{f.target}</code> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No flags.</p>
          )}
        </Panel>
        <Panel title="Cost & latency">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Tokens" value={report.totalTokens.toLocaleString()} />
            <Stat label="Latency" value={`${(report.totalLatencyMs / 1000).toFixed(1)}s`} />
            <Stat label="Est. cost" value={`$${report.estCostUsd.toFixed(3)}`} />
          </dl>
          <p className="mt-2 text-[11px] text-ink-3">Ledger v{report.ledgerVersion} · summed over all agent runs</p>
        </Panel>
      </div>

      <Panel title="Agent runs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">Stage</th>
                <th scope="col" className="py-2 pr-3 font-medium">Model</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Latency</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Prompt</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Output</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium">At</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(runs ?? []).map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pr-3 font-medium">{r.stage}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs text-ink-2">{r.model}</td>
                  <td className="py-1.5 pr-3 text-right">{(r.latencyMs / 1000).toFixed(2)}s</td>
                  <td className="py-1.5 pr-3 text-right text-ink-2">{r.promptTokens?.toLocaleString() ?? "–"}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-2">{r.outputTokens?.toLocaleString() ?? "–"}</td>
                  <td className="py-1.5 pr-3">{r.ok ? <Pill toneVar="--st-ok">ok</Pill> : <Pill toneVar="--st-bad" title={r.error}>failed</Pill>}</td>
                  <td className="py-1.5 text-xs text-ink-3">{new Date(r.at).toLocaleTimeString()}</td>
                </tr>
              ))}
              {!runs?.length ? (
                <tr><td colSpan={7} className="py-4 text-center text-ink-3">No runs recorded.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Tile({ label, value, ok, hint }: { label: string; value: string; ok?: boolean; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        {ok !== undefined ? <Pill toneVar={ok ? "--st-ok" : "--st-warn"}>{ok ? "pass" : "check"}</Pill> : null}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-ink-3">{hint}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4" aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
