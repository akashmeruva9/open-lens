"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { AutoPublishedChip, ChecksFlaggedChip, EvidenceChip, LiveChip } from "@/components/ui/chips";
import { IconBook, IconPlayFilled } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { pickVideo, type CardItem, type CardVideo } from "@/lib/cards";
import { regionName } from "@/lib/format";
import { assetUrl, CardMedia, cardLabel } from "./story-card";

/** Muted, looping preview that only loads while in view; off for reduced motion and Save-Data. */
function MutedPreview({ video }: { video: CardVideo }) {
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    setAllowed(!reduced && !saveData);
  }, []);

  useEffect(() => {
    if (!allowed || !box.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(box.current);
    return () => io.disconnect();
  }, [allowed]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (inView) void v.play().catch(() => setBroken(true));
    else v.pause();
  }, [inView]);

  if (!video.mp4Url) return null;
  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0">
      {allowed && (inView || playing) && !broken ? (
        <video
          ref={ref}
          src={assetUrl(video.mp4Url)}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onError={() => setBroken(true)}
          className={`size-full object-cover transition-opacity duration-300 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

export function SpotlightHero({ card, edition }: { card: CardItem; edition: string }) {
  const video = pickVideo(card, edition);
  return (
    <article aria-labelledby="spotlight-title" className="grid items-center gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-8">
      <Link href={`/story/${card.id}`} aria-label={cardLabel(card, video)} className="group relative block rounded-lg focus-visible:outline-offset-4">
        <CardMedia card={card} video={video} size="hero" className="aspect-[4/5] w-full md:aspect-[2/3]" />
        {video ? <MutedPreview video={video} /> : null}
      </Link>
      <div className="min-w-0">
        <p className="eyebrow flex flex-wrap items-center gap-x-1.5">
          <span className="text-accent">In the spotlight</span>
          <span aria-hidden>·</span>
          <span className="text-ink-2">{regionName(card.region)}</span>
          <span aria-hidden>·</span>
          <RelTime iso={card.updatedAt} />
        </p>
        <h1 id="spotlight-title" className="display mt-3 text-[30px] leading-[34px] text-ink sm:text-[40px] sm:leading-[44px]">
          <Link href={`/story/${card.id}`} className="rounded-sm decoration-[3px] underline-offset-4 hover:underline">{card.title}</Link>
        </h1>
        <p className="mt-3 line-clamp-5 text-[15px] leading-[22px] text-ink-2">{card.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {card.corrected ? <LiveChip>Corrected</LiveChip> : null}
          {card.autoPublished ? <AutoPublishedChip /> : null}
          {card.checksFlagged ? <ChecksFlaggedChip /> : null}
          {card.evidence.supported ? <EvidenceChip state="supported" count={card.evidence.supported} /> : null}
          {card.evidence.contested ? <EvidenceChip state="contested" count={card.evidence.contested} /> : null}
          {card.evidence.unverified ? <EvidenceChip state="unverified" count={card.evidence.unverified} /> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {video ? (
            <Link href={`/story/${card.id}#watch`} className={buttonClass("primary", "lg")}>
              <IconPlayFilled size={16} /> Watch
            </Link>
          ) : (
            <Link href={`/story/${card.id}`} className={buttonClass("primary", "lg")}>Read the story</Link>
          )}
          <Link href={`/story/${card.id}#research`} className={buttonClass("outline", "lg")}>
            <IconBook size={17} /> Open the research
          </Link>
        </div>
        <p className="mt-4 text-xs text-ink-3">
          {card.sourceCount} sources · {card.languages.length} language{card.languages.length === 1 ? "" : "s"}
        </p>
      </div>
    </article>
  );
}

export function SpotlightList({ cards, edition }: { cards: CardItem[]; edition: string }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="spotlight-list-title">
      <h2 id="spotlight-list-title" className="display mb-1 text-[17px] text-ink">Also leading</h2>
      <ol className="divide-y divide-line">
        {cards.map((c) => {
          const video = pickVideo(c, edition);
          return (
            <li key={c.id}>
              <Link href={`/story/${c.id}`} aria-label={cardLabel(c, video)} className="group flex gap-3.5 py-3.5">
                <CardMedia card={c} video={video} size="thumb" className="aspect-[4/5] w-24 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block">{regionName(c.region)}</span>
                  <span className="display mt-1 line-clamp-3 block text-[16px] leading-[20px] text-ink decoration-2 underline-offset-2 group-hover:underline">{c.title}</span>
                  <span className="mt-1 line-clamp-2 block text-[13px] leading-[18px] text-ink-2">{c.summary}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
