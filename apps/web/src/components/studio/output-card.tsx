"use client";
import type { OutputRecord, Publication } from "@openlens/schemas";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OutputStatusPill, Pill, PubStatusPill, Tag } from "@/components/ui/chips";
import { IconAlert, IconBroadcast, IconCheck, IconRefresh } from "@/components/ui/icons";
import { langName } from "@/lib/format";
import { CHANNEL, OUTPUT_KIND } from "@/lib/meta";
import { TierBadge } from "./frames/media-frames";
import { OutputPreview } from "./output-preview";

export interface ChannelState { live: boolean; reason?: string }

export function OutputCard({
  output, all, storyVersion, publications, channel, highlighted, actions,
}: {
  output: OutputRecord;
  all: OutputRecord[];
  storyVersion: number;
  publications: Publication[];
  channel: ChannelState | undefined;
  highlighted: boolean;
  actions: {
    approve: (id: string) => Promise<unknown>;
    regenerate: (id: string) => Promise<unknown>;
    publish: (id: string, mode: "live" | "dry_run") => Promise<unknown>;
  };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stale = output.ledgerVersion < storyVersion;
  const approved = ["approved", "published", "scheduled"].includes(output.status);
  const canLive = channel?.live === true;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const liveReason = !approved ? "Approve before publishing" : !canLive ? channel?.reason ?? "Channel not connected" : undefined;

  return (
    <article
      aria-label={`${CHANNEL[output.channel]?.label} ${OUTPUT_KIND[output.kind]} (${langName(output.lang)})`}
      className={`card flex flex-col overflow-hidden transition ${highlighted ? "flash ring-2 ring-[var(--st-warn)]" : ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{CHANNEL[output.channel]?.label ?? output.channel}</span>
          <span className="text-xs text-ink-3">{OUTPUT_KIND[output.kind] ?? output.kind}</span>
          <Tag>{output.lang.toUpperCase()}</Tag>
          {output.tier ? <TierBadge tier={output.tier} /> : null}
        </div>
        <OutputStatusPill status={output.status} />
      </header>

      {output.status === "needs_review" || stale ? (
        <p className="flex items-start gap-1.5 px-3 pt-2 text-xs" style={{ color: "var(--st-warn)" }}>
          <IconAlert size={13} className="mt-px shrink-0" />
          {output.staleReason ?? "Built on an older ledger version"} · built on v{output.ledgerVersion}, ledger is v{storyVersion}
        </p>
      ) : null}

      <div className="flex-1 p-3">
        <OutputPreview output={output} all={all} />
      </div>

      <div className="space-y-2 border-t border-line px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink-3">
          Cites {output.claimIds.join(", ") || "none"} · v{output.ledgerVersion}
          {output.aiDisclosure ? <Pill toneVar="--st-info" className="ml-1">AI disclosed</Pill> : <Pill toneVar="--st-bad" className="ml-1">No AI label</Pill>}
          {output.approvedBy ? <span className="ml-auto">Approved by {output.approvedBy}</span> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={approved ? "secondary" : "primary"} disabled={!!busy || output.status === "approved" || output.status === "published"}
            onClick={() => run("approve", () => actions.approve(output.id))}>
            <IconCheck size={13} /> {output.status === "approved" ? "Approved" : busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button size="sm" disabled={!!busy || output.status === "qa"} onClick={() => run("regen", () => actions.regenerate(output.id))}>
            <IconRefresh size={13} /> {output.status === "qa" ? "Regenerating…" : "Regenerate"}
          </Button>
          <Button size="sm" disabled={!!busy || !approved} title={!approved ? "Approve before publishing" : "Validate and log without posting"}
            onClick={() => run("dry", () => actions.publish(output.id, "dry_run"))}>
            {busy === "dry" ? "Validating…" : "Dry run"}
          </Button>
          <Button size="sm" variant="danger" disabled={!!busy || !!liveReason} title={liveReason ?? "Publish to the live channel"}
            onClick={() => {
              if (confirm(`Publish LIVE to ${CHANNEL[output.channel]?.label}?`)) void run("live", () => actions.publish(output.id, "live"));
            }}>
            <IconBroadcast size={13} /> {busy === "live" ? "Publishing…" : "Publish live"}
          </Button>
        </div>
        {!canLive && output.channel !== "app" ? <p className="text-[11px] text-ink-3">Live: {channel?.reason ?? "not connected"}</p> : null}
        {error ? <p role="alert" className="text-xs text-[var(--st-bad)]">{error}</p> : null}
        {publications.length ? (
          <ul className="space-y-1 border-t border-line pt-2" aria-label="Publication records">
            {publications.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2">
                <PubStatusPill status={p.status} />
                <span className="font-semibold uppercase">{p.mode === "dry_run" ? "dry run" : "live"}</span>
                <span>v{p.ledgerVersion}</span>
                <span className="text-ink-3">{new Date(p.publishedAt).toLocaleTimeString()}</span>
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" className="underline">view</a> : null}
                {p.externalId ? <code className="text-ink-3">{p.externalId}</code> : null}
                {p.error ? <span className="text-[var(--st-bad)]">{p.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
