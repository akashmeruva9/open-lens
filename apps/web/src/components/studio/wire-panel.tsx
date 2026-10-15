"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Pill } from "@/components/ui/chips";
import { RelTime } from "@/components/ui/time";
import { useClient, useLoad } from "@/lib/data/browser";
import { regionName } from "@/lib/format";

/** Automatic discovery ("the wire"): last cycles, developing events, budget and policy. */
export function WirePanel() {
  const client = useClient();
  const { data, error, reload } = useLoad(() => client.studio.ingest(), [client]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  if (error) return null;
  if (!data) return <div className="card mb-6 h-24 animate-pulse" aria-busy="true" />;
  if (!data.configured)
    return (
      <section className="card mb-6 p-4 text-sm text-ink-2" aria-label="Wire">
        <strong className="text-ink">Wire not configured.</strong> Automatic discovery runs on the API (set <code>INGEST_INTERVAL_MIN</code>, add verified outlets to <code>data/sources/allowlist.json</code> and feeds to <code>data/sources/feeds.json</code>).
      </section>
    );

  const last = data.cycles[0];
  const p = data.policy!;
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await client.studio.runIngest();
      setMsg("Cycle started — results appear here in a minute or two.");
      setTimeout(() => void reload(), 5000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mb-6 p-4 sm:p-5" aria-labelledby="wire-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Automatic discovery</p>
          <h2 id="wire-h" className="font-display text-xl font-semibold">The wire</h2>
          <p className="mt-1 text-xs text-ink-3">
            {p.markets.length} markets · {p.verifiedOutlets} verified outlets · {p.feedsEnabled} feeds{p.gdelt ? " + GDELT signals" : ""} · auto-publish{" "}
            <strong>{p.autoPublish === "low_risk" ? "low-risk only" : "off (editor approval)"}</strong> · pipeline runs today {data.budget.runs}/{p.dailyRunBudget}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.running ? <Pill toneVar="--st-info">Running…</Pill> : null}
          <button type="button" onClick={run} disabled={busy || data.running}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50">
            Run now
          </button>
        </div>
      </div>
      {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
      {p.verifiedOutlets === 0 ? (
        <p className="mt-3 rounded-md border border-line p-2 text-sm text-ink-2">
          No verified outlets yet: the wire can discover headlines but cannot ingest text or create stories. Review
          <code> data/sources/allowlist.json</code> and set <code>verified: true</code> for outlets whose reuse terms you have confirmed.
        </p>
      ) : null}

      {last ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ["Last cycle", <RelTime key="t" iso={last.startedAt} />],
            ["New leads", last.newLeads],
            ["Ingested", last.ingested],
            ["Stories created", last.storiesCreated.length],
            ["Stories updated", last.storiesUpdated.length],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-ink-3">No cycles yet.</p>
      )}
      {last?.errors.length ? (
        <details className="mt-2 text-xs text-ink-3">
          <summary>{last.errors.length} issue(s) in last cycle</summary>
          <ul className="mt-1 list-disc pl-5">{last.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      ) : null}

      {data.candidates.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">Developing events</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.candidates.slice(0, 12).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-3">{regionName(c.market)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
                <span className="text-xs text-ink-3">{c.domains.length} outlets · {c.leads} articles</span>
                {c.storyId ? (
                  <Link href={`/studio/${c.storyId}`} className="text-xs font-medium underline">open story</Link>
                ) : (
                  <span className="text-xs text-ink-3">watching</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
