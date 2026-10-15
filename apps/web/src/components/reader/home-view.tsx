"use client";
import { MARKETS, MARKET_CODES } from "@openlens/config";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { IconArticle, IconFilm, IconPin, IconShieldCheck } from "@/components/ui/icons";
import { CATEGORIES, hasVideo, inCategory, newestFirst, spotlightScore, type CardItem } from "@/lib/cards";
import { useLiveCards } from "@/lib/data/live";
import { editionName, inEdition } from "@/lib/edition";
import { langNative } from "@/lib/format";
import { ArticleCard } from "./article-card";
import { CategoryIcon } from "./category-icons";
import { Rail } from "./rail";
import { SpotlightHero, SpotlightList } from "./spotlight";
import { StoryCard } from "./story-card";

const marketSubtitle = (m: string) => (MARKETS as Record<string, { languages: readonly string[] }>)[m]?.languages.map(langNative).join(" · ");

export function HomeView({ initial, edition }: { initial: CardItem[]; edition: string }) {
  const all = useLiveCards(initial);
  const cards = all.filter((c) => inEdition(c.region, edition)).sort(newestFirst);

  if (!cards.length) return <EmptyEdition edition={edition} hasAny={all.length > 0} />;

  const now = Date.now();
  const ranked = [...cards].sort((a, b) => spotlightScore(b, now) - spotlightScore(a, now));
  const [hero, ...rest] = ranked;
  const spotlightList = rest.slice(0, 3);

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
          icon: <IconPin size={18} />,
          list: cards.filter((c) => c.market === m),
        }))
      : CATEGORIES.map((cat) => ({
          key: cat.slug,
          title: cat.label,
          subtitle: `${editionName(edition)} edition`,
          href: `/browse/${cat.slug}`,
          icon: <CategoryIcon slug={cat.slug} size={18} />,
          list: cards.filter((c) => inCategory(c, cat)),
        }));

  return (
    <div className="pb-8">
      <div className="page pt-6 sm:pt-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <SpotlightHero card={hero} edition={edition} />
          <SpotlightList cards={spotlightList} edition={edition} />
        </div>
      </div>

      <div className="mt-14">
        <Rail title="Latest videos" icon={<IconFilm size={18} />} href="/browse/videos" items={videoItems(videos)}
          subtitle={edition === "APAC" ? "Vertical briefs from every desk" : `In ${marketSubtitle(edition)} where available`} />

        <Rail title="Explainers" variant="article" icon={<IconArticle size={18} />} href="/browse/explainers"
          subtitle="Read-first stories, built from the evidence ledger"
          items={explainers.map((c) => ({ key: c.id, node: <ArticleCard card={c} /> }))} />

        {groupRails.map((g) => (
          <Rail key={g.key} title={g.title} subtitle={g.subtitle} href={g.href} icon={g.icon} items={videoItems(g.list)} />
        ))}

        <Rail title="Corrected & updated" icon={<IconShieldCheck size={18} />} href="/browse/corrected"
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
