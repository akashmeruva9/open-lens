"use client";
import { uiStrings } from "@openlens/config";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { EvidenceDots } from "@/components/ui/chips";
import { IconBook, IconPlayFilled, IconSparkle } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { formatDuration, pickVideo, type CardItem, type CardVideo } from "@/lib/cards";
import { langNative, regionName } from "@/lib/format";
import { assetUrl, burnTitle, CardMedia, cardLabel, frameTitle, LensMotif } from "./story-card";

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

type Tile = "lead" | "stack" | "tall";

/** Landscape media for a spotlight tile: photo (preferred) or video still, with the headline burned in. */
function TileMedia({ card, video, tile }: { card: CardItem; video?: CardVideo; tile: Tile }) {
  const [failed, setFailed] = useState(false);
  const src = card.heroImage ?? video?.thumbnailUrl;
  const dur = formatDuration(video?.durationSeconds);
  return (
    <div className={`poster relative overflow-hidden rounded-[6px] bg-frame ${tile === "lead" ? "aspect-[16/10]" : "aspect-[16/9]"}`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote media pipeline assets
        <img src={assetUrl(src)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover object-[center_30%] transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <LensMotif dark />
      )}
      <div aria-hidden className="scrim absolute inset-0" />
      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
        <span className="flex flex-wrap gap-1">
          {video ? <span className="media-pill" lang={video.lang}>{langNative(video.lang)}</span> : <span className="media-pill">Explainer</span>}
          {card.corrected ? <span className="media-pill !bg-live">Corrected</span> : null}
        </span>
        {video?.aiPresenter ? (
          <span className="media-pill !text-[10px]" lang={video.lang} title="Synthetic, disclosed presenter">
            <IconSparkle size={10} /> {uiStrings(video.lang).aiPresenter}
          </span>
        ) : null}
      </div>
      <p className={`burn absolute inset-x-3 bottom-2.5 line-clamp-3 ${tile === "lead" ? "text-[clamp(20px,7cqi,40px)] sm:inset-x-4 sm:bottom-3.5" : "text-[clamp(16px,6.6cqi,22px)]"} ${video && dur ? "pr-12" : ""}`}>
        {burnTitle(frameTitle(card.title))}
      </p>
      {video ? (
        <span aria-hidden className="absolute bottom-2.5 right-2.5 inline-flex size-9 items-center justify-center rounded-full bg-white text-black">
          <IconPlayFilled size={15} />
        </span>
      ) : null}
    </div>
  );
}

function SpotlightTile({ card, edition, tile, label }: { card: CardItem; edition: string; tile: Tile; label?: string }) {
  const video = pickVideo(card, edition);
  const Title = tile === "lead" ? "h1" : "h3";
  return (
    <article className={`frame-card relative flex flex-col ${tile === "stack" ? "" : "h-full"}`}>
      {label ? <span className="pop-pill absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">{label}</span> : null}
      <Link href={`/story/${card.id}`} aria-label={cardLabel(card, video)} className="group flex flex-1 flex-col rounded-[6px] focus-visible:outline-offset-4">
        <TileMedia card={card} video={video} tile={tile} />
        <div className="flex flex-1 flex-col px-0.5 pb-1 pt-3">
          <Title className={`font-display font-semibold tracking-[-0.015em] text-ink decoration-2 underline-offset-2 group-hover:underline ${
            tile === "lead" ? "text-[22px] leading-[26px] sm:text-[24px] sm:leading-[28px]" : "line-clamp-3 text-[15px] leading-[19px]"
          }`}>
            {card.title}
          </Title>
          {tile !== "stack" ? (
            <p className={`mt-2 text-[14px] leading-[20px] text-ink-2 ${tile === "lead" ? "line-clamp-4" : "line-clamp-6"}`}>{card.summary}</p>
          ) : null}
          <p className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-2.5 text-xs leading-4 text-ink-3">
            <span className="font-semibold text-ink-2">{regionName(card.region)}</span>
            <span aria-hidden>·</span>
            <RelTime iso={card.updatedAt} />
            <EvidenceDots evidence={card.evidence} className="ml-1" />
          </p>
        </div>
      </Link>
    </article>
  );
}

/**
 * Spotlight grid: an outlined lead tile (spans two rows) under an "In the spotlight" pill, two stacked tiles,
 * and a tall tile with its dek. Collapses to lead + 2-up on tablets, a single column on phones.
 */
export function SpotlightGrid({ cards, edition }: { cards: CardItem[]; edition: string }) {
  const [lead, a, b, c] = cards;
  if (!lead) return null;
  return (
    <section aria-label="In the spotlight" className="grid gap-3.5 pt-3.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-[auto_auto]">
      <div className="md:col-span-2 xl:col-span-1 xl:row-span-2">
        <SpotlightTile card={lead} edition={edition} tile="lead" label="In the spotlight" />
      </div>
      {a || b ? (
        <div className="grid gap-3.5 xl:row-span-2">
          {a ? <SpotlightTile card={a} edition={edition} tile="stack" /> : null}
          {b ? <SpotlightTile card={b} edition={edition} tile="stack" /> : null}
        </div>
      ) : null}
      {c ? (
        <div className="xl:row-span-2">
          <SpotlightTile card={c} edition={edition} tile="tall" />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Featured band: full-bleed dark panel over a blurred still, the vertical video on the left (muted preview while
 * in view) and the headline, dek, disclosure labels and actions on the right. Dark in both themes.
 */
export function FeaturedBand({ card, edition }: { card: CardItem; edition: string }) {
  const video = pickVideo(card, edition);
  const still = video?.thumbnailUrl ?? card.heroImage;
  const ev = card.evidence;
  const counts = (["supported", "contested", "unverified"] as const).filter((k) => ev[k] > 0);
  return (
    <section aria-labelledby="featured-title" className="page mt-14">
      <div className="relative isolate overflow-hidden rounded-lg bg-frame text-white dark:ring-1 dark:ring-line">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element -- decorative backdrop
          <img src={assetUrl(still)} alt="" aria-hidden className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-60 blur-3xl" />
        ) : null}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/55 via-black/45 to-black/25" />
        <div className="grid items-center gap-6 p-4 sm:p-7 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:p-10">
          <Link href={`/story/${card.id}${video ? "#watch" : ""}`} aria-label={cardLabel(card, video)}
            className="group relative mx-auto block w-full max-w-[340px] rounded-md focus-visible:outline-offset-4">
            <CardMedia card={card} video={video} className="aspect-[9/16] w-full shadow-[0_24px_60px_rgb(0_0_0/0.45)]" />
            {video ? <MutedPreview video={video} /> : null}
          </Link>
          <div className="min-w-0">
            <span className="pop-pill">Featured</span>
            <h2 id="featured-title" className="burn mt-4 text-[32px] leading-[34px] sm:text-[44px] sm:leading-[46px] xl:text-[52px] xl:leading-[54px]">
              <Link href={`/story/${card.id}`} className="rounded-sm decoration-[3px] underline-offset-[6px] hover:underline">{burnTitle(card.title)}</Link>
            </h2>
            <p className="mt-4 line-clamp-4 max-w-2xl text-[16px] leading-[24px] text-white/85">{card.summary}</p>
            <ul className="mt-5 flex flex-wrap items-center gap-1.5 text-xs font-semibold leading-4" aria-label="Story labels">
              {card.corrected ? <li className="rounded-full bg-live px-2.5 py-1 text-white">Corrected</li> : null}
              {card.autoPublished ? (
                <li className="rounded-full border border-white/45 px-2.5 py-[3px] text-white/90" title="Published automatically by the OpenLens wire; no editor has reviewed it.">
                  Auto-published · not editor-reviewed
                </li>
              ) : null}
              {card.checksFlagged ? (
                <li className="rounded-full border border-[#ff8a8c] px-2.5 py-[3px] text-[#ffb3b4]" title="An automated check found a problem. Read the evidence with care.">
                  Automated checks flagged issues
                </li>
              ) : null}
              {counts.map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-white/90">
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: FEATURED_DOT[k] }} />
                  <span className="tabular-nums">{ev[k]}</span> {k}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              {video ? (
                <Link href={`/story/${card.id}#watch`} className={buttonClass("primary", "lg", "!bg-white !text-black hover:!bg-white/85")}>
                  <IconPlayFilled size={16} /> Watch
                </Link>
              ) : (
                <Link href={`/story/${card.id}`} className={buttonClass("primary", "lg", "!bg-white !text-black hover:!bg-white/85")}>Read the story</Link>
              )}
              <Link href={`/story/${card.id}#research`} className={buttonClass("outline", "lg", "!border-white/70 !text-white hover:!bg-white hover:!text-black")}>
                <IconBook size={17} /> Open the research
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/65">
              {regionName(card.region)} · {card.sourceCount} sources · {card.languages.length} language{card.languages.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Evidence dot colours on the always-dark band (the dark-theme --ev-* values). */
const FEATURED_DOT = { supported: "#34d399", contested: "#fb7185", unverified: "#facc15" } as const;
