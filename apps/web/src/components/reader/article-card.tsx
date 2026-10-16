"use client";
import Link from "next/link";
import { useState } from "react";
import { EvidenceBar, EvidenceDots } from "@/components/ui/chips";
import { IconRead } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { primaryCategory, type CardItem } from "@/lib/cards";
import { regionName } from "@/lib/format";
import { CategoryIcon } from "./category-icons";
import { assetUrl, cardLabel } from "./story-card";

/** 4:3 article thumbnail; without an image it becomes a typographic tile (market + category glyph). */
function ArticleThumb({ card }: { card: CardItem }) {
  const [failed, setFailed] = useState(false);
  const cat = primaryCategory(card);
  if (card.heroImage && !failed) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote media pipeline assets */}
        <img src={assetUrl(card.heroImage)} alt="" loading="lazy" onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      </div>
    );
  }
  return (
    <div className="relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-md bg-surface p-3">
      <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-[45%] -right-[12%] w-[70%] transition-transform duration-300 group-hover:scale-[1.03]">
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgb(0 0 0 / 0.05)" strokeWidth="14" className="dark:stroke-white/10" />
        <path d="M50 12A38 38 0 0 1 88 50" fill="none" stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="14" />
      </svg>
      <span aria-hidden className="relative inline-flex size-9 items-center justify-center rounded-full bg-bg text-ink">
        {cat ? <CategoryIcon slug={cat.slug} size={18} /> : <IconRead size={18} />}
      </span>
      <div className="relative">
        <p className="display text-[18px] leading-[20px] text-ink">{regionName(card.region)}</p>
        <EvidenceBar evidence={card.evidence} className="mt-2 w-14" />
      </div>
    </div>
  );
}

/** Horizontal article card: thumbnail left; accent "Explainer" pill, title and metadata right. */
export function ArticleCard({ card }: { card: CardItem }) {
  const cat = primaryCategory(card);
  return (
    <Link href={`/story/${card.id}`} aria-label={cardLabel(card)} className="group grid grid-cols-[minmax(0,44%)_minmax(0,1fr)] gap-3 rounded-md focus-visible:outline-offset-4">
      <ArticleThumb card={card} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <span className="inline-flex rounded-[5px] bg-accent px-2 py-0.5 text-[11px] font-semibold leading-4 text-accent-ink">Explainer</span>
          {card.corrected ? <span className="inline-flex rounded-[5px] bg-live px-2 py-0.5 text-[11px] font-semibold leading-4 text-white">Corrected</span> : null}
        </div>
        <h3 className="mt-2 line-clamp-4 font-display text-[15px] font-semibold leading-[19px] tracking-[-0.01em] text-ink decoration-2 underline-offset-2 group-hover:underline">{card.title}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-4 text-ink-3">
          <span className="font-semibold text-ink-2">{cat?.label ?? regionName(card.region)}</span>
          <span aria-hidden>·</span>
          <RelTime iso={card.updatedAt} />
          <EvidenceDots evidence={card.evidence} className="ml-1" />
        </p>
      </div>
    </Link>
  );
}
