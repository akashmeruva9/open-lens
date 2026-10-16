"use client";
import { MARKETS, MARKET_CODES } from "@openlens/config";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { CATEGORIES, hasVideo, inCategory, newestFirst, spotlightScore, type CardItem } from "@/lib/cards";
import { useLiveCards } from "@/lib/data/live";
import { editionName, inEdition } from "@/lib/edition";
import { langNative } from "@/lib/format";
import { ArticleCard } from "./article-card";
import { Rail } from "./rail";
import { FeaturedBand, SpotlightGrid } from "./spotlight";
import { StoryCard } from "./story-card";

const marketSubtitle = (m: string) => (MARKETS as Record<string, { languages: readonly string[] }>)[m]?.languages.map(langNative).join(" · ");

export function HomeView({ initial, edition }: { initial: CardItem[]; edition: string }) {
  const all = useLiveCards(initial);
  const cards = all.filter((c) => inEdition(c.region, edition)).sort(newestFirst);

  if (!cards.length) return <EmptyEdition edition={edition} hasAny={all.length > 0} />;

  const now = Date.now();
  const ranked = [...cards].sort((a, b) => spotlightScore(b, now) - spotlightScore(a, now));
  const spotlight = ranked.slice(0, 4);
  // Featured: the strongest video story not already in the grid (else the lead, when it has a video).
  const featured = ranked.find((c, i) => i >= spotlight.length && hasVideo(c)) ?? (hasVideo(ranked[0]) ? ranked[0] : undefined);

  const videos = cards.filter(hasVideo);
  const explainers = cards.filter((c) => !hasVideo(c));
  const corrected = cards.filter((c) => c.corrected || c.status === "corrected");

  const videoItems = (list: CardItem[]) => list.map((c) => ({ key: c.id, node: <StoryCard card={c} edition={edition} /> }));

  // Asia-Pacific edition: one rail per market present (APAC-wide desk first). Single edition: its topics.
  const groupRails =
    edition === "APAC"
      ? MARKET_CODES.map((m) => ({
          key: m,
          title: m === "APAC" ? "Across Asia-Pacific" : MARKETS[m].name,
          subtitle: marketSubtitle(m),
          href: `/browse/${m.toLowerCase()}`,
          list: cards.filter((c) => c.market === m),
        }))
      : CATEGORIES.map((cat) => ({
          key: cat.slug,
          title: cat.label,
          subtitle: `${editionName(edition)} edition`,
          href: `/browse/${cat.slug}`,
          list: cards.filter((c) => inCategory(c, cat)),
        }));

  return (
    <div className="pb-8">
      <div className="page pt-5 sm:pt-8">
        <SpotlightGrid cards={spotlight} edition={edition} />
      </div>

      {featured ? <FeaturedBand card={featured} edition={edition} /> : null}

      <div className="mt-14">
        <Rail title="Latest videos" href="/browse/videos" items={videoItems(videos)}
          subtitle={edition === "APAC" ? "Vertical briefs from every desk" : `In ${marketSubtitle(edition)} where available`} />

        <Rail title="Explainers" variant="article" href="/browse/explainers"
          subtitle="Read-first stories, built from the evidence ledger"
          items={explainers.map((c) => ({ key: c.id, node: <ArticleCard card={c} /> }))} />

        {groupRails.map((g) => (
          <Rail key={g.key} title={g.title} subtitle={g.subtitle} href={g.href} items={videoItems(g.list)} />
        ))}

        <Rail title="Corrected & updated" href="/browse/corrected"
          subtitle="Every correction is logged publicly and travels to every video and post"
          items={videoItems(corrected)} />
      </div>
    </div>
  );
}

function EmptyEdition({ edition, hasAny }: { edition: string; hasAny: boolean }) {
  return (
    <div className="page py-20">
      <div className="mx-auto max-w-xl text-center">
        <p className="eyebrow">{editionName(edition)} edition</p>
        <h1 className="display mt-2 text-[30px] leading-[34px] sm:text-[40px] sm:leading-[44px]">The wire is quiet here.</h1>
        <p className="mt-3 text-[15px] leading-[22px] text-ink-2">
          OpenLens only publishes a story once its claims are in the evidence ledger: sourced, quoted and checked. Nothing in
          {" "}{editionName(edition)} has cleared that bar yet. Region-wide stories will appear here as soon as they do.
        </p>
        {hasAny && edition !== "APAC" ? (
          <p className="mt-6">
            <Link href="/browse/wire" className={buttonClass("primary", "lg")}>Browse the whole wire</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
