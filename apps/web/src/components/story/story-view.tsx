"use client";
import type { StoryBundle } from "@openlens/schemas";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { EvidenceChip, StoryStatusPill } from "@/components/ui/chips";
import { IconChevronLeft, IconSources } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { useLiveBundle } from "@/lib/data/live";
import { API_URL } from "@/lib/env";
import { regionName, titleCase } from "@/lib/format";
import { EVIDENCE } from "@/lib/meta";
import { AssessmentView } from "./assessment-view";
import { CorrectionBanner } from "./correction-banner";
import { Dossier } from "./dossier";
import { LensLanes } from "./lens-lanes";
import { MediaPanel } from "./media-panel";
import { ShareButton } from "./share-button";
import { buildIndexes, StoryContext, type DossierTab } from "./story-context";

const assetUrl = (p: string) => (/^https?:/.test(p) ? p : `${API_URL.replace(/\/$/, "")}${p}`);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function StoryView({ initial }: { initial: StoryBundle }) {
  const bundle = useLiveBundle(initial);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [tab, setTab] = useState<DossierTab>("claims");
  const [activeClaim, setActiveClaim] = useState<string | null>(null);

  const scrollToEl = (id: string) => {
    // Wait for the dossier to render before scrolling.
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
      el.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    }, 60);
  };

  const focusClaim = useCallback((claimId: string) => {
    setDossierOpen(true);
    setTab("claims");
    setActiveClaim(claimId);
    scrollToEl(`claim-${claimId}`);
  }, []);
  const focusSource = useCallback((sourceId: string) => {
    setDossierOpen(true);
    setTab("sources");
    scrollToEl(`source-${sourceId}`);
  }, []);

  const ctx = useMemo(() => ({ bundle, ...buildIndexes(bundle), focusClaim, focusSource }), [bundle, focusClaim, focusSource]);
  const { story, assessment } = bundle;
  const headline = assessment?.headline || story.title;
  const summary = assessment?.neutralSummary || story.summary;
  const stateCounts = Object.keys(EVIDENCE)
    .map((s) => [s, bundle.claims.filter((c) => c.state === s).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <StoryContext.Provider value={ctx}>
      <article className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:pt-6" aria-labelledby="story-title">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 rounded-md text-sm text-ink-2 hover:text-ink">
          <IconChevronLeft size={15} /> All stories
        </Link>

        <CorrectionBanner corrections={bundle.corrections} />
        {bundle.story.autoPublished ? (
          <p role="note" className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--st-warn)", color: "var(--st-warn)" }}>
            Auto-published by the OpenLens wire under the low-risk policy. Every fact links to its source below, but an editor has not reviewed this story yet.
          </p>
        ) : null}

        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <header className="lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <span className="font-semibold uppercase tracking-wider text-ink-2">{regionName(story.region)}</span>
              <span aria-hidden>·</span>
              <span>{story.topics.map(titleCase).join(" / ")}</span>
              {story.status === "corrected" ? <StoryStatusPill status="corrected" /> : null}
            </div>
            <h1 id="story-title" className="mt-2 font-serif text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]">
              {headline}
            </h1>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{summary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-3">
              <RelTime iso={story.updatedAt} prefix="Updated " />
              <button type="button" onClick={() => { setDossierOpen(true); setTab("sources"); scrollToEl("research"); }}
                className="inline-flex items-center gap-1 hover:text-ink">
                <IconSources size={14} /> {bundle.sources.length} sources
              </button>
              <span>Ledger v{story.version}</span>
              <span className="uppercase tracking-wide">{story.languages.join(" · ")}</span>
              <span className="ml-auto"><ShareButton title={headline} text={summary.slice(0, 140)} /></span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Evidence summary">
              {stateCounts.map(([s, n]) => (
                <EvidenceChip key={s} state={s} count={n} />
              ))}
            </div>
          </header>

          <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="lg:sticky lg:top-20">
              <MediaPanel assetUrl={assetUrl} />
            </div>
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <LensLanes lanes={bundle.lanes} />
            {assessment ? <AssessmentView assessment={assessment} stale={assessment.ledgerVersion < story.version} /> : null}
            <Dossier
              open={dossierOpen}
              setOpen={setDossierOpen}
              tab={tab}
              setTab={setTab}
              activeClaim={activeClaim}
              setActiveClaim={setActiveClaim}
            />
          </div>
        </div>
      </article>
    </StoryContext.Provider>
  );
}
