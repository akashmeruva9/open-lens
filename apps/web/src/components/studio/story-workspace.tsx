"use client";
import type { CorrectionEvent } from "@openlens/schemas";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StoryStatusPill, Tag } from "@/components/ui/chips";
import { IconAlert, IconChevronLeft, IconExternal, IconGauge, IconLayers, IconLedger, IconBroadcast } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { useClient, useLoad, useStudioBundle } from "@/lib/data/browser";
import { regionName } from "@/lib/format";
import { AssessmentTab } from "./assessment-tab";
import { ChannelsTab } from "./channels-tab";
import type { ClaimEdit } from "./claim-editor";
import { EvalsTab } from "./evals-tab";
import { LedgerTab } from "./ledger-tab";
import { PipelineProgress } from "./pipeline-progress";
import { SimulateCorrectionDialog } from "./simulate-correction";

const TABS = [
  { id: "ledger", label: "Ledger", icon: IconLedger },
  { id: "assessment", label: "Assessment", icon: IconLayers },
  { id: "channels", label: "Channels", icon: IconBroadcast },
  { id: "evals", label: "Evals", icon: IconGauge },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function StoryWorkspace({ id }: { id: string }) {
  const client = useClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "channels") as TabId;
  const setTab = (t: TabId) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  const { data: bundle, error, loading, reload, events } = useStudioBundle(id);
  const channelsQ = useLoad(() => client.studio.channels(), [client]);
  const evalsQ = useLoad(() => (tab === "evals" ? client.studio.evals(id) : Promise.resolve(null)), [client, id, tab]);
  const runsQ = useLoad(() => (tab === "evals" ? client.studio.runs(id) : Promise.resolve(null)), [client, id, tab]);

  const [lastCorrection, setLastCorrection] = useState<CorrectionEvent | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [simOpen, setSimOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function flashOutputs(ids: string[]) {
    // Stagger the highlight so the ripple is visible in the demo.
    setHighlight(new Set());
    ids.forEach((oid, i) => setTimeout(() => setHighlight((s) => new Set(s).add(oid)), 180 * i));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlight(new Set()), 8000 + ids.length * 180);
  }

  async function patchClaim(claimId: string, patch: ClaimEdit) {
    const res = await client.studio.patchClaim(id, claimId, patch);
    setLastCorrection(res.correction);
    await reload();
    return res.correction;
  }

  const actions = {
    approve: async (oid: string) => { await client.studio.approveOutput(oid); await reload(); },
    regenerate: async (oid: string) => { await client.studio.regenerate(oid); await reload(); },
    publish: async (oid: string, mode: "live" | "dry_run") => {
      const pub = await client.studio.publish(oid, mode);
      setToast(mode === "dry_run" ? `Dry run validated (${pub.channel})` : `Published to ${pub.channel}`);
      setTimeout(() => setToast(null), 2500);
      await reload();
    },
  };

  if (error && !bundle) return <p role="alert" className="card p-6 text-sm text-[var(--st-bad)]">Could not load story: {error}</p>;
  if (!bundle) return <p className="py-20 text-center text-sm text-ink-3">{loading ? "Loading story…" : "Not found"}</p>;

  const { story } = bundle;
  const needsReview = bundle.outputs.filter((o) => o.status === "needs_review").length;
  const channels = Object.fromEntries((channelsQ.data ?? []).map((c) => [c.channel, { live: c.live, reason: c.reason }]));

  return (
    <div>
      <Link href="/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <IconChevronLeft size={15} /> Queue
      </Link>

      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <StoryStatusPill status={story.status} />
              <Tag>Ledger v{story.version}</Tag>
              <Tag>{story.riskTier === "sensitive" ? "Sensitive · human gate" : "Low risk"}</Tag>
              <span>{regionName(story.region)}</span>
              <span>· <RelTime iso={story.updatedAt} prefix="updated " /></span>
            </div>
            <h1 className="mt-1.5 font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">{story.title}</h1>
            <p className="mt-1 text-xs text-ink-3">
              {bundle.claims.length} claims · {bundle.sources.length} sources · {bundle.outputs.length} outputs · {bundle.publications.length} publications · {bundle.corrections.length} corrections
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSimOpen(true)} disabled={!bundle.claims.length}>
              <IconAlert size={14} /> Simulate correction
            </Button>
            <Link href={`/story/${story.id}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
              Reader view <IconExternal size={13} />
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <PipelineProgress status={story.status} stages={events.stages} />
          {events.live ? <p className="mt-1 text-[11px] text-ink-3">SSE {events.connected ? "connected" : "disconnected"}</p> : null}
        </div>
        {needsReview ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: "color-mix(in oklab, var(--st-warn) 10%, transparent)", color: "var(--st-warn)" }}>
            <IconAlert size={15} /> {needsReview} output{needsReview === 1 ? "" : "s"} need review after ledger changes.
            <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => setTab("channels")}>Review</button>
          </p>
        ) : null}
      </header>

      <div role="tablist" aria-label="Workspace" className="no-scrollbar mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`ws-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`ws-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
            <t.icon size={15} /> {t.label}
            {t.id === "channels" && needsReview ? <span className="rounded-full bg-[var(--st-warn)] px-1.5 text-[10px] font-bold text-white">{needsReview}</span> : null}
          </button>
        ))}
      </div>

      <div id={`ws-panel-${tab}`} role="tabpanel" aria-labelledby={`ws-tab-${tab}`} className="pt-5">
        {tab === "ledger" ? (
          <LedgerTab bundle={bundle} onPatch={patchClaim} lastCorrection={lastCorrection} onOpenChannels={() => setTab("channels")} />
        ) : null}
        {tab === "assessment" ? (
          <AssessmentTab bundle={bundle} busy={busy} onApprove={async () => {
            setBusy(true);
            try { await client.studio.approveStory(id); await reload(); } finally { setBusy(false); }
          }} />
        ) : null}
        {tab === "channels" ? <ChannelsTab bundle={bundle} channels={channels} highlighted={highlight} actions={actions} /> : null}
        {tab === "evals" ? <EvalsTab report={evalsQ.data} runs={runsQ.data} loading={evalsQ.loading} /> : null}
      </div>

      <SimulateCorrectionDialog
        bundle={bundle}
        open={simOpen}
        onClose={() => setSimOpen(false)}
        onSubmit={async (claimId, patch) => {
          const corr = await patchClaim(claimId, patch);
          setTab("channels");
          flashOutputs(corr.impactedOutputIds);
        }}
      />

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
        {toast ? <span className="rounded-full bg-ink px-4 py-2 text-sm text-bg shadow-lg">{toast}</span> : null}
      </div>
    </div>
  );
}
