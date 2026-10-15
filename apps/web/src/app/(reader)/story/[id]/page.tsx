import { marketOf, MARKETS } from "@openlens/config";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryView, type MoreRail } from "@/components/story/story-view";
import { newestFirst } from "@/lib/cards";
import { loadCards, loadStory } from "@/lib/data/server";
import { inEdition } from "@/lib/edition";
import { readEdition } from "@/lib/edition-server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const res = await loadStory(id);
  if (!res.ok) return { title: "Story" };
  const title = res.data.assessment?.headline || res.data.story.title;
  const description = (res.data.assessment?.neutralSummary || res.data.story.summary).slice(0, 200);
  return { title, description, openGraph: { title, description, type: "article" } };
}

export default async function StoryPage({ params }: Params) {
  const { id } = await params;
  const [res, cardsRes, edition] = await Promise.all([loadStory(id), loadCards(), readEdition()]);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div role="alert" className="page py-20 text-center">
        <p className="display text-[30px] leading-[34px]">This story could not be loaded.</p>
        <p className="mt-2 text-sm text-ink-3">({res.status}) {res.message.slice(0, 160)}</p>
      </div>
    );
  }

  // "More from {market}"; falls back to the latest in the reader's edition when the market has nothing else.
  let more: MoreRail | undefined;
  if (cardsRes.ok) {
    const market = marketOf(res.data.story.region);
    const others = cardsRes.data.filter((c) => c.id !== id).sort(newestFirst);
    const same = market ? others.filter((c) => c.market === market) : [];
    more = same.length
      ? { title: `More from ${market === "APAC" ? "across Asia-Pacific" : MARKETS[market!].name}`, href: `/browse/${market!.toLowerCase()}`, cards: same.slice(0, 12) }
      : { title: "More from Asia-Pacific", href: "/browse/wire", cards: others.filter((c) => inEdition(c.region, edition)).slice(0, 12) };
  }
  return <StoryView initial={res.data} more={more} edition={edition} />;
}
