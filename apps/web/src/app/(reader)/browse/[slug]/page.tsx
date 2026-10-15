import { MARKETS, MARKET_CODES, type MarketCode } from "@openlens/config";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/reader/category-icons";
import { StoryCard } from "@/components/reader/story-card";
import { IconArticle, IconFilm, IconPin, IconSearch, IconShieldCheck } from "@/components/ui/icons";
import { categoryOf, hasVideo, inCategory, newestFirst, type CardItem } from "@/lib/cards";
import { loadCards } from "@/lib/data/server";
import { editionName, inEdition } from "@/lib/edition";
import { readEdition } from "@/lib/edition-server";
import { langNative } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

interface View { title: string; blurb: string; icon: ReactNode; filter: (c: CardItem) => boolean; byEdition: boolean }

function resolve(slug: string): View | null {
  const s = slug.toLowerCase();
  if (s === "wire") return { title: "Wire", blurb: "Everything OpenLens has published, newest first.", icon: <CategoryIcon slug="wire" size={18} />, filter: () => true, byEdition: true };
  if (s === "videos") return { title: "Latest videos", blurb: "Vertical video briefs with disclosed AI presenters.", icon: <IconFilm size={18} />, filter: hasVideo, byEdition: true };
  if (s === "explainers") return { title: "Explainers", blurb: "Read-first stories built from the evidence ledger.", icon: <IconArticle size={18} />, filter: (c) => !hasVideo(c), byEdition: true };
  if (s === "corrected") return { title: "Corrected & updated", blurb: "Stories whose ledger changed after publication. Each correction is logged publicly.", icon: <IconShieldCheck size={18} />, filter: (c) => c.corrected || c.status === "corrected", byEdition: true };
  const cat = categoryOf(s);
  if (cat) return { title: cat.label, blurb: `${cat.label} stories across the selected edition.`, icon: <CategoryIcon slug={cat.slug} size={18} />, filter: (c) => inCategory(c, cat), byEdition: true };
  const m = s.toUpperCase();
  if ((MARKET_CODES as string[]).includes(m)) {
    const market = m as MarketCode;
    return {
      title: market === "APAC" ? "Across Asia-Pacific" : MARKETS[market].name,
      blurb: market === "APAC" ? "Region-wide stories from the English desk." : `Stories from ${MARKETS[market].name}, in ${MARKETS[market].languages.map(langNative).join(" · ")}.`,
      icon: <IconPin size={18} />,
      filter: (c) => c.market === market,
      byEdition: false,
    };
  }
  return null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const v = resolve((await params).slug);
  return { title: v?.title ?? "Browse" };
}

export default async function BrowsePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const view = resolve(slug);
  if (!view) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const isWire = slug.toLowerCase() === "wire";
  const [res, edition] = await Promise.all([loadCards(), readEdition()]);
  const all = res.ok ? res.data : [];
  const needle = q.toLowerCase();
  const items = all
    .filter((c) => (!view.byEdition || inEdition(c.region, edition)) && view.filter(c))
    .filter((c) => !needle || `${c.title} ${c.summary} ${c.topics.join(" ")}`.toLowerCase().includes(needle))
    .sort(newestFirst);

  return (
    <div className="page pb-8 pt-8 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-bg">{view.icon}</span>
          <div>
            <h1 className="display text-[30px] leading-[34px] sm:text-[40px] sm:leading-[44px]">{view.title}</h1>
            <p className="mt-1 text-[15px] leading-[22px] text-ink-2">
              {view.blurb}
              {view.byEdition && edition !== "APAC" ? <> Showing the {editionName(edition)} edition (plus region-wide stories).</> : null}
            </p>
          </div>
        </div>
        {isWire ? (
          <form role="search" action="/browse/wire" className="flex w-full items-center gap-2 sm:w-auto">
            <label htmlFor="wire-q" className="sr-only">Search stories</label>
            <div className="relative flex-1 sm:w-80">
              <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input id="wire-q" name="q" type="search" defaultValue={q} autoFocus={sp.focus === "search"} placeholder="Search the wire"
                className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none" />
            </div>
            <button type="submit" className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-bg">Search</button>
          </form>
        ) : null}
      </header>

      {!res.ok ? (
        <p role="alert" className="py-16 text-center text-ink-2">The newsroom feed is unavailable right now ({res.status}).</p>
      ) : items.length ? (
        <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((c) => (
            <li key={c.id}><StoryCard card={c} edition={edition} /></li>
          ))}
        </ul>
      ) : (
        <div className="py-20 text-center">
          <p className="display text-[24px]">{q ? `Nothing on the wire matches “${q}”.` : "Nothing here yet."}</p>
          <p className="mt-2 text-[15px] text-ink-2">Stories appear once their claims are sourced and checked in the ledger.</p>
        </div>
      )}
    </div>
  );
}
