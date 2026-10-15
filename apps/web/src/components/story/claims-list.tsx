"use client";
import type { Claim } from "@openlens/schemas";
import { useState } from "react";
import { EvidenceChip, LensChip, Tag } from "@/components/ui/chips";
import { IconChevronDown, IconExternal } from "@/components/ui/icons";
import { EVIDENCE } from "@/lib/meta";
import { titleCase } from "@/lib/format";
import { SourceWithPassage } from "./passage";
import { useStory } from "./story-context";

export function ClaimsList({ active, onToggle }: { active: string | null; onToggle: (id: string | null) => void }) {
  const { bundle } = useStory();
  const [filter, setFilter] = useState<string>("all");
  const states = Object.keys(EVIDENCE).filter((s) => bundle.claims.some((c) => c.state === s));
  const claims = bundle.claims.filter((c) => filter === "all" || c.state === filter || c.id === active);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter claims by evidence state">
        {["all", ...states].map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filter === s ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-surface-2"}`}>
            {s === "all" ? `All ${bundle.claims.length}` : `${EVIDENCE[s].label} ${bundle.claims.filter((c) => c.state === s).length}`}
          </button>
        ))}
      </div>
      <ol className="space-y-2">
        {claims.map((c) => (
          <ClaimItem key={c.id} claim={c} open={active === c.id} onToggle={() => onToggle(active === c.id ? null : c.id)} />
        ))}
      </ol>
    </div>
  );
}

function ClaimItem({ claim, open, onToggle }: { claim: Claim; open: boolean; onToggle: () => void }) {
  const { claimNo, sourceById } = useStory();
  const n = claimNo.get(claim.id);
  const panelId = `claim-panel-${claim.id}`;
  return (
    <li id={`claim-${claim.id}`} className={`card scroll-mt-24 overflow-hidden ${open ? "border-ink-3" : ""}`}>
      <h4>
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}
          className="flex w-full items-start gap-3 p-3 text-left hover:bg-surface-2/60 sm:p-4">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold tabular-nums text-ink-2">
            {n}
          </span>
          <span className="flex-1">
            <span className="block text-[15px] leading-snug text-ink">{claim.text}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              <EvidenceChip state={claim.state} />
              <Tag>{titleCase(claim.claimType)}</Tag>
              {claim.attributedTo ? <span>Attributed to <span className="font-medium text-ink-2">{claim.attributedTo}</span></span> : null}
            </span>
          </span>
          <IconChevronDown className={`mt-1 shrink-0 text-ink-3 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </h4>
      {open ? (
        <div id={panelId} className="space-y-3 border-t border-line bg-surface-2/40 p-3 sm:p-4">
          <p className="text-xs text-ink-3">
            {EVIDENCE[claim.state]?.help} Independent sources: <strong className="text-ink-2">{claim.independentSourceCount}</strong> · Ledger version {claim.version}
          </p>
          {claim.stateReason ? (
            <p className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-2">
              <span className="font-semibold">Editor note:</span> {claim.stateReason}
            </p>
          ) : null}
          {claim.evidence.map((ev, i) => {
            const src = sourceById.get(ev.sourceId);
            return (
              <figure key={`${ev.sourceId}-${i}`} className="rounded-lg border border-line bg-surface p-3">
                <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {src?.publisher ?? ev.sourceId}
                    {src ? <LensChip lens={src.lens.rating} compact /> : null}
                    {src ? <Tag>{titleCase(src.sourceType)}</Tag> : null}
                  </span>
                  {src ? (
                    <a href={src.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
                      Original <IconExternal size={12} />
                    </a>
                  ) : null}
                </figcaption>
                {src ? <SourceWithPassage text={src.text} passage={ev.passage} /> : <blockquote className="italic">“{ev.passage}”</blockquote>}
              </figure>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}
