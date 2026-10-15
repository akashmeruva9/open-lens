"use client";
import type { LensLane } from "@openlens/schemas";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EvidenceChip } from "@/components/ui/chips";
import { IconChevronLeft, IconChevronRight, IconSparkle } from "@/components/ui/icons";
import { LENS, LENS_ORDER } from "@/lib/meta";
import { ClaimRef } from "./claim-ref";
import { useStory } from "./story-context";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function LensLanes({ lanes }: { lanes: LensLane[] }) {
  const ordered = [...lanes].sort((a, b) => LENS_ORDER.indexOf(a.lens) - LENS_ORDER.indexOf(b.lens));
  const initial = Math.max(0, ordered.findIndex((l) => l.lens === "center"));
  const [active, setActive] = useState(initial);
  const track = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const scrollTo = useCallback((i: number, smooth = true) => {
    const el = track.current?.children[i] as HTMLElement | undefined;
    if (!el || !track.current) return;
    const left = el.offsetLeft - (track.current.clientWidth - el.clientWidth) / 2;
    track.current.scrollTo({ left, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  }, []);

  // Start on the centre lane.
  useEffect(() => {
    scrollTo(initial, false);
  }, [initial, scrollTo]);

  // Track which lane is centred while the user swipes.
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [ordered.length]);

  function onTabKey(e: KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + ordered.length) % ordered.length;
    setActive(next);
    scrollTo(next);
    tabs.current[next]?.focus();
  }

  if (!ordered.length) return null;

  return (
    <section aria-labelledby="lenses-title" className="mt-16">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Perspectives</p>
          <h2 id="lenses-title" className="display mt-1 text-[24px] leading-[28px]">How outlets framed it</h2>
        </div>
        <div className="hidden gap-1.5 sm:flex">
          <button type="button" aria-label="Previous perspective" disabled={active === 0}
            onClick={() => scrollTo(active - 1)}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-bg hover:bg-surface disabled:opacity-40">
            <IconChevronLeft />
          </button>
          <button type="button" aria-label="Next perspective" disabled={active === ordered.length - 1}
            onClick={() => scrollTo(active + 1)}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-bg hover:bg-surface disabled:opacity-40">
            <IconChevronRight />
          </button>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface px-3 py-2.5 text-[13px] leading-[19px] text-ink-2">
        <IconSparkle size={15} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <strong className="font-semibold text-ink">Model-generated framing.</strong> Each lane summarises how outlets with a given rating cover
          this story. Ratings come from a documented outlet table. Lanes are <em>not</em> a truth meter. Check the cited claims.
        </span>
      </p>

      <div role="tablist" aria-label="Perspective lanes" className="mt-4 flex gap-1 rounded-full bg-surface p-1" onKeyDown={onTabKey}>
        {ordered.map((lane, i) => {
          const m = LENS[lane.lens] ?? LENS.unrated;
          const selected = i === active;
          return (
            <button
              key={lane.lens}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`lane-tab-${lane.lens}`}
              aria-selected={selected}
              aria-controls={`lane-${lane.lens}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActive(i);
                scrollTo(i);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold transition ${selected ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"}`}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: `var(${m.tone})` }} />
              {m.short}
            </button>
          );
        })}
      </div>

      <div
        ref={track}
        className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2"
        aria-roledescription="carousel"
      >
        {ordered.map((lane, i) => (
          <LaneCard key={lane.lens} lane={lane} index={i} total={ordered.length} />
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-ink-3 sm:hidden" aria-hidden>
        Swipe for other perspectives
      </p>
    </section>
  );
}

function LaneCard({ lane, index, total }: { lane: LensLane; index: number; total: number }) {
  const { sourceById, claimById } = useStory();
  const m = LENS[lane.lens] ?? LENS.unrated;
  const outlets = lane.sourceIds.map((id) => sourceById.get(id)).filter((s) => !!s);

  return (
    <article
      id={`lane-${lane.lens}`}
      data-index={index}
      role="tabpanel"
      aria-labelledby={`lane-tab-${lane.lens}`}
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}: ${m.label}`}
      className="card relative w-[88%] shrink-0 snap-center overflow-hidden p-4 sm:w-[78%] sm:p-5"
    >
      <div aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: `var(${m.tone})` }} />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: `var(${m.tone})` }}>{m.label}</h3>
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-3 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
          <IconSparkle size={11} /> Model-generated framing
        </span>
      </header>

      <p className="display mt-3 text-[19px] leading-[25px] text-ink">{lane.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-1.5">Emphasizes</p>
          <ul className="space-y-1 text-sm text-ink-2">
            {lane.emphasizes.map((e) => (
              <li key={e} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />{e}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-1.5">Does not establish</p>
          <ul className="space-y-1 text-sm text-ink-2">
            {lane.doesNotEstablish.map((e) => (
              <li key={e} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full" style={{ background: "var(--ev-unverified)" }} />{e}</li>
            ))}
          </ul>
        </div>
      </div>

      {lane.claimIds.length ? (
        <div className="mt-4">
          <p className="eyebrow mb-1.5">Claims this lane relies on</p>
          <ul className="space-y-1.5">
            {lane.claimIds.map((id) => {
              const c = claimById.get(id);
              if (!c) return null;
              return (
                <li key={id} className="flex items-start gap-2 text-sm">
                  <ClaimRef id={id} />
                  <span className="flex-1 text-ink-2">
                    {c.attributedTo ? <span className="font-medium text-ink">{c.attributedTo}: </span> : null}
                    {c.text}
                  </span>
                  <span className="hidden sm:inline"><EvidenceChip state={c.state} /></span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <footer className="mt-4 border-t border-line pt-3">
        <p className="eyebrow mb-1">Outlets in this lane</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {outlets.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                {s.publisher}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}
