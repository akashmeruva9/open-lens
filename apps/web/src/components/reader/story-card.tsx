"use client";
import { uiStrings } from "@openlens/config";
import Link from "next/link";
import { useState } from "react";
import { EvidenceBar, EvidenceDots } from "@/components/ui/chips";
import { IconPlayFilled, IconRead, IconSparkle } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { formatDuration, pickVideo, primaryCategory, type CardItem, type CardVideo } from "@/lib/cards";
import { API_URL } from "@/lib/env";
import { langName, langNative, regionName } from "@/lib/format";

export const assetUrl = (p: string) => (/^https?:/.test(p) ? p : `${API_URL.replace(/\/$/, "")}${p}`);

/** Drop the "(FICTIONAL …)" suffix inside frames where space is tight; the full title stays in text below/labels. */
const frameTitle = (t: string) => t.replace(/\s*\((FICTIONAL[^)]*)\)\s*$/i, "");
const isFictional = (t: string) => /\(FICTIONAL/i.test(t);

/** Accessible name for a card link: title, market, format, duration, language. */
export function cardLabel(card: CardItem, video?: CardVideo) {
  const parts = [card.title, regionName(card.region)];
  if (video) {
    const d = formatDuration(video.durationSeconds);
    parts.push(["Video", d, langName(video.lang)].filter(Boolean).join(", "));
  } else parts.push("Article");
  if (card.corrected) parts.push("Corrected");
  return parts.join(". ");
}

/** Lens motif: an oversized ring with an accent aperture, cropped by the frame. Decorative. */
function LensMotif({ dark }: { dark: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -right-[38%] -top-[16%] w-[118%] transition-transform duration-300 group-hover:scale-[1.03]">
      <circle cx="50" cy="50" r="38" fill="none" stroke={dark ? "rgb(255 255 255 / 0.07)" : "rgb(0 0 0 / 0.05)"} strokeWidth="14" />
      {/* accent aperture on the lower-left quadrant so it stays inside the frame */}
      <path d="M12 50A38 38 0 0 0 50 88" fill="none" stroke="var(--accent)" strokeOpacity={dark ? 0.42 : 0.3} strokeWidth="14" />
    </svg>
  );
}

function Overlays({ video, corrected }: { video?: CardVideo; corrected: boolean }) {
  const dur = formatDuration(video?.durationSeconds);
  return (
    <>
      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
        <span className="flex flex-wrap gap-1">
          {video ? <span className="media-pill" lang={video.lang}>{langNative(video.lang)}</span> : null}
          {corrected ? <span className="media-pill !bg-live">Corrected</span> : null}
        </span>
        {video?.aiPresenter ? (
          <span className="media-pill !text-[10px]" lang={video.lang} title="Synthetic, disclosed presenter">
            <IconSparkle size={10} /> {uiStrings(video.lang).aiPresenter}
          </span>
        ) : null}
      </div>
      {dur ? <span className="media-pill absolute bottom-2 left-2 tabular-nums">{dur}</span> : null}
    </>
  );
}

/**
 * Typographic frame used when there is no thumbnail (or it fails to load). Dark for video,
 * light surface for articles. Headline is set inside; never a fixed-height clip for non-Latin text.
 */
export function PosterFrame({
  card, video, size = "card", className = "",
}: { card: CardItem; video?: CardVideo; size?: "card" | "hero" | "thumb"; className?: string }) {
  const dark = Boolean(video);
  const market = regionName(card.region);
  const cat = primaryCategory(card);
  if (size === "thumb") {
    return (
      <div className={`poster relative overflow-hidden rounded-md ${dark ? "bg-frame text-frame-ink" : "bg-surface text-ink"} ${className}`}>
        <LensMotif dark={dark} />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className={`inline-flex size-9 items-center justify-center rounded-full ${dark ? "bg-white text-black" : "bg-ink text-bg"}`}>
            {dark ? <IconPlayFilled size={16} /> : <IconRead size={16} />}
          </span>
        </span>
        {video?.durationSeconds ? <span className="media-pill absolute bottom-1.5 left-1.5 tabular-nums">{formatDuration(video.durationSeconds)}</span> : null}
      </div>
    );
  }
  return (
    <div className={`poster relative flex flex-col overflow-hidden ${size === "hero" ? "rounded-lg" : "rounded-md"} ${dark ? "bg-frame text-frame-ink" : "bg-surface text-ink"} ${className}`}>
      <LensMotif dark={dark} />
      {dark ? <Overlays video={video} corrected={card.corrected} /> : card.corrected ? <Overlays corrected /> : null}
      <div className={`relative mt-auto flex flex-col gap-2 ${size === "hero" ? "p-6 pb-7 sm:p-8" : "p-3 pb-3.5"}`}>
        <p className={`poster-eyebrow ${dark ? "text-frame-ink-2" : "text-ink-3"}`}>
          {market}
          {cat ? ` · ${cat.label}` : ""}
        </p>
        <p className={`poster-title ${size === "hero" ? "poster-title-lg line-clamp-6" : "line-clamp-6"}`}>{frameTitle(card.title)}</p>
        <div className={`flex items-center gap-2 ${size === "hero" ? "mt-2" : "mt-1"} ${dark && formatDuration(video?.durationSeconds) ? "pl-12" : ""}`}>
          <EvidenceBar evidence={card.evidence} className="min-w-0 flex-1 opacity-90" />
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full ${size === "hero" ? "size-14" : "size-9"} ${dark ? "bg-white text-black" : "bg-ink text-bg"}`}
            aria-hidden
          >
            {dark ? <IconPlayFilled size={size === "hero" ? 24 : 15} /> : <IconRead size={size === "hero" ? 24 : 16} />}
          </span>
        </div>
        {isFictional(card.title) ? (
          <p className={`text-[10px] font-semibold leading-3 ${dark ? "text-frame-ink-2" : "text-ink-3"}`}>Fictional sample</p>
        ) : null}
      </div>
    </div>
  );
}

/** Media tile: thumbnail with scrim + overlays, falling back to the PosterFrame when missing or broken. */
export function CardMedia({
  card, video, size = "card", className = "",
}: { card: CardItem; video?: CardVideo; size?: "card" | "hero" | "thumb"; className?: string }) {
  const [failed, setFailed] = useState(false);
  const thumb = video?.thumbnailUrl ?? card.heroImage;
  if (!thumb || failed) return <PosterFrame card={card} video={video} size={size} className={className} />;
  return (
    <div className={`relative overflow-hidden bg-frame ${size === "hero" ? "rounded-lg" : "rounded-md"} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote media pipeline assets */}
      <img
        src={assetUrl(thumb)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div aria-hidden className="scrim absolute inset-0" />
      {size !== "thumb" ? <Overlays video={video} corrected={card.corrected} /> : null}
      {video && size !== "thumb" ? (
        <span aria-hidden className="absolute bottom-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-white text-black">
          <IconPlayFilled size={15} />
        </span>
      ) : null}
    </div>
  );
}

function MetaRow({ card }: { card: CardItem }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 text-ink-3">
      <span className="font-semibold text-ink-2">{regionName(card.region)}</span>
      <span aria-hidden>·</span>
      <RelTime iso={card.updatedAt} />
      <EvidenceDots evidence={card.evidence} className="ml-1" />
    </p>
  );
}

/**
 * Vertical 9:16 card. VideoCard when the story has a video, else PosterCard (headline inside the frame,
 * "Read" glyph). The whole card is one link with a descriptive accessible name.
 */
export function StoryCard({ card, edition = "APAC" }: { card: CardItem; edition?: string }) {
  const video = pickVideo(card, edition);
  const headlineInside = !(video?.thumbnailUrl ?? card.heroImage);
  return (
    <Link href={`/story/${card.id}`} aria-label={cardLabel(card, video)} className="group block rounded-md focus-visible:outline-offset-4">
      <CardMedia card={card} video={video} className="aspect-[9/16] w-full" />
      {headlineInside ? (
        <p className="mt-2 line-clamp-3 text-[13px] leading-[18px] text-ink-2">{card.summary}</p>
      ) : (
        <h3 className="display mt-2 line-clamp-4 text-[15px] leading-[19px] text-ink decoration-2 underline-offset-2 group-hover:underline">
          {card.title}
        </h3>
      )}
      <MetaRow card={card} />
    </Link>
  );
}
