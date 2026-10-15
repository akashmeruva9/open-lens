"use client";
import type { KeyboardEvent } from "react";
import { IconBook, IconChevronDown } from "@/components/ui/icons";
import { ClaimsList } from "./claims-list";
import { ContextPanel, SourcesPanel, TimelinePanel } from "./dossier-panels";
import { useStory, type DossierTab } from "./story-context";

const TABS: { id: DossierTab; label: string }[] = [
  { id: "claims", label: "Claims" },
  { id: "timeline", label: "Timeline" },
  { id: "context", label: "Context" },
  { id: "sources", label: "Sources" },
];

export function Dossier(props: {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: DossierTab;
  setTab: (t: DossierTab) => void;
  activeClaim: string | null;
  setActiveClaim: (id: string | null) => void;
}) {
  const { bundle } = useStory();
  const { open, setOpen, tab, setTab } = props;
  const counts: Record<DossierTab, number> = {
    claims: bundle.claims.length,
    timeline: bundle.timeline.length,
    context: bundle.context.length,
    sources: bundle.sources.length,
  };

  function onKey(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length].id;
    setTab(next);
    document.getElementById(`dossier-tab-${next}`)?.focus();
  }

  return (
    <section id="research" aria-labelledby="research-title" className="mt-16 scroll-mt-24">
      <h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="research-body"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 rounded-lg bg-ink p-5 text-left text-bg transition hover:bg-ink/90"
      >
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
          <IconBook size={20} />
        </span>
        <span className="flex-1">
          <span id="research-title" className="display block text-[24px] leading-[28px]">Open the research</span>
          <span className="mt-0.5 block text-sm opacity-75">
            {counts.claims} claims · {counts.sources} sources · {counts.timeline} timeline events · {counts.context} context items
          </span>
        </span>
        <IconChevronDown size={22} className={`opacity-75 transition ${open ? "rotate-180" : ""}`} />
      </button>
      </h2>

      {open ? (
        <div id="research-body" className="mt-3">
          <div role="tablist" aria-label="Research dossier" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`dossier-tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`dossier-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`-mb-px whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
              >
                {t.label} <span className="ml-0.5 text-xs tabular-nums text-ink-3">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div id={`dossier-panel-${tab}`} role="tabpanel" aria-labelledby={`dossier-tab-${tab}`} className="pt-4">
            {tab === "claims" ? <ClaimsList active={props.activeClaim} onToggle={props.setActiveClaim} /> : null}
            {tab === "timeline" ? <TimelinePanel /> : null}
            {tab === "context" ? <ContextPanel /> : null}
            {tab === "sources" ? <SourcesPanel /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
