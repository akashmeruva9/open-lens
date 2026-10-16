"use client";
import type { StoryBundle } from "@openlens/schemas";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Rail } from "@/components/reader/rail";
import { StoryCard } from "@/components/reader/story-card";
import { buttonClass } from "@/components/ui/button";
import { AutoPublishedChip, ChecksFlaggedChip, EvidenceChip, LiveChip } from "@/components/ui/chips";
import { IconBook, IconChevronLeft, IconPlayFilled, IconSources } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { primaryCategory, type CardItem } from "@/lib/cards";
import { useLiveBundle } from "@/lib/data/live";
import { API_URL } from "@/lib/env";
import { langNative, regionName } from "@/lib/format";
import { EVIDENCE } from "@/lib/meta";
import { ExplainerView } from "./explainer-view";
import { AssessmentView } from "./assessment-view";
import { CorrectionBanner } from "./correction-banner";
import { Dossier } from "./dossier";
import { LensLanes } from "./lens-lanes";
import { MediaPanel } from "./media-panel";
import { ShareButton } from "./share-button";
import { SourcesSection } from "./sources-section";
import { buildIndexes, StoryContext, type DossierTab } from "./story-context";

const assetUrl = (p: string) => (/^https?:/.test(p) ? p : `${API_URL.replace(/\/$/, "")}${p}`);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface MoreRail { title: string; href: string; cards: CardItem[] }

export function StoryView({ initial, more, edition = "APAC" }: { initial: StoryBundle; more?: MoreRail; edition?: string }) {
  const bundle = useLiveBundle(initial);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [tab, setTab] = useState<DossierTab>("claims");
  const [activeClaim, setActiveClaim] = useState<string | null>(null);

  const scrollToEl = (id: string, flash = true) => {
    // Wait for the dossier to render before scrolling.
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      if (!flash) return;
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
  const openResearch = useCallback(() => {
    setDossierOpen(true);
    scrollToEl("research", false);
  }, []);
  const watch = useCallback(() => {
    const stage = document.getElementById("watch");
    stage?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    // User-initiated: sound is allowed here.
    void stage?.querySelector("video")?.play().catch(() => {});
  }, []);

  // Deep links from the home CTAs.
  useEffect(() => {
    if (window.location.hash === "#research") openResearch();
  }, [openResearch]);

  const ctx = useMemo(() => ({ bundle, ...buildIndexes(bundle), focusClaim, focusSource }), [bundle, focusClaim, focusSource]);
  const { story, assessment } = bundle;
  const headline = assessment?.headline || story.title;
  const summary = assessment?.neutralSummary || story.summary;
  const stateCounts = Object.keys(EVIDENCE)
    .map((s) => [s, bundle.claims.filter((c) => c.state === s).length] as const)
    .filter(([, n]) => n > 0);
  const hasVideo = bundle.outputs.some((o) => o.kind === "video");
  const cat = primaryCategory(story);

  return (
    <StoryContext.Provider value={ctx}>
      <article aria-labelledby="story-title" className="pb-28 lg:pb-0">
        <div className="page pt-0 sm:pt-6 lg:pt-8">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-14">
            <div id="watch" className="-mx-4 scroll-mt-24 sm:mx-0 lg:sticky lg:top-8">
              <MediaPanel assetUrl={assetUrl} />
            </div>

            <header className="min-w-0 lg:pt-2">
              <Link href="/" className="mb-5 hidden items-center gap-1 rounded-full text-sm font-semibold text-ink-2 hover:text-ink lg:inline-flex">
                <IconChevronLeft size={16} /> Home
              </Link>
              <CorrectionBanner corrections={bundle.corrections} />
              {story.autoPublished ? (
                <p role="note" className="mb-5 rounded-lg border border-ink-3 px-3 py-2 text-sm text-ink-2">
                  Auto-published by the OpenLens wire. Every fact links to its source below; no editor has reviewed this story.
                  {story.checksFlagged ? " Automated checks flagged an issue with this story: some points may not be as well supported as they read." : ""}
                </p>
              ) : null}

              <p className="eyebrow flex flex-wrap items-center gap-x-1.5">
                <span className="text-ink-2">{regionName(story.region)}</span>
                {cat ? (<><span aria-hidden>·</span><span>{cat.label}</span></>) : null}
                <span aria-hidden>·</span>
                <RelTime iso={story.updatedAt} prefix="Updated " />
              </p>
              <h1 id="story-title" className="display mt-3 text-[30px] leading-[34px] sm:text-[40px] sm:leading-[44px]">{headline}</h1>
              <p className="mt-4 text-[17px] leading-[26px] text-ink-2">{summary}</p>

              <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Evidence summary">
                {story.status === "corrected" ? <LiveChip>Corrected</LiveChip> : null}
                {story.autoPublished ? <AutoPublishedChip /> : null}
                {story.checksFlagged ? <ChecksFlaggedChip /> : null}
                {stateCounts.map(([s, n]) => (
                  <EvidenceChip key={s} state={s} count={n} />
                ))}
              </div>

              <div className="mt-6 hidden flex-wrap items-center gap-2 lg:flex">
                {hasVideo ? (
                  <button type="button" onClick={watch} className={buttonClass("primary", "lg")}>
                    <IconPlayFilled size={16} /> Watch
                  </button>
                ) : null}
                <button type="button" onClick={openResearch} className={buttonClass("outline", "lg")}>
                  <IconBook size={17} /> Open the research
                </button>
                <ShareButton title={headline} text={summary.slice(0, 140)} />
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-4">
                <Fact label="Sources">
                  <button type="button" onClick={() => { setDossierOpen(true); setTab("sources"); scrollToEl("research", false); }}
                    className="inline-flex items-center gap-1 font-semibold text-ink hover:text-accent">
                    <IconSources size={14} /> {bundle.sources.length}
                  </button>
                </Fact>
                <Fact label="Claims">{bundle.claims.length}</Fact>
                <Fact label="Ledger">v{story.version}</Fact>
                <Fact label="Languages">
                  <span className="line-clamp-2">{story.languages.map(langNative).join(" · ")}</span>
                </Fact>
              </dl>
            </header>
          </div>
        </div>

        <div className="page">
          <div className="max-w-[880px]">
            {assessment?.explainer ? <ExplainerView explainer={assessment.explainer} /> : null}
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
            <SourcesSection />
          </div>
        </div>

        {more && more.cards.length ? (
          <div className="mt-16">
            <Rail title={more.title} href={more.href}
              items={more.cards.map((c) => ({ key: c.id, node: <StoryCard card={c} edition={edition} /> }))} />
          </div>
        ) : null}

        {/* Phone: sticky action bar */}
        <nav aria-label="Story actions" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="grid grid-cols-3 gap-2 px-4 py-2.5">
            <button type="button" onClick={watch} disabled={!hasVideo} className={buttonClass("primary", "md", "w-full")}>
              <IconPlayFilled size={15} /> Watch
            </button>
            <button type="button" onClick={openResearch} className={buttonClass("outline", "md", "w-full")}>
              <IconBook size={16} /> Research
            </button>
            <ShareButton title={headline} text={summary.slice(0, 140)} compact />
          </div>
        </nav>
      </article>
    </StoryContext.Provider>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{children}</dd>
    </div>
  );
}
