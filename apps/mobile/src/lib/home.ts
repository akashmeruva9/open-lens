import { LANGUAGES, MARKET_CODES, MARKETS, isLang, marketOf, type MarketCode } from '@openlens/config';

import { fixtureBundle } from './api';
import { mediaItems } from './bundle';
import { matchesRegion } from './catalog';
import type { FeedItem } from './types';

/** Video facts a card needs: from `FeedItem.videos` (live API) or the fixture bundle (demo mode). */
export type CardVideo = {
  url: string;
  hlsUrl?: string;
  durationSeconds?: number;
  lang?: string;
  thumbnailUrl?: string;
  aiPresenter: boolean;
};

export type HomeItem = FeedItem & { video?: CardVideo };

export function toHomeItem(item: FeedItem): HomeItem {
  const fromFeed = item.videos?.find((v) => v.mp4Url && v.aspect !== '16:9') ?? item.videos?.find((v) => v.mp4Url);
  if (fromFeed?.mp4Url) {
    return {
      ...item,
      video: {
        url: fromFeed.mp4Url, hlsUrl: fromFeed.hlsUrl, durationSeconds: fromFeed.durationSeconds,
        lang: fromFeed.lang, thumbnailUrl: fromFeed.thumbnailUrl, aiPresenter: fromFeed.aiPresenter,
      },
    };
  }
  if (!item.videoUrl) return item;
  const b = fixtureBundle(item.id);
  const v = b ? mediaItems(b).find((m) => m.kind === 'video') : undefined;
  if (v?.kind === 'video') {
    return {
      ...item,
      video: {
        url: v.payload.mp4Url,
        hlsUrl: v.payload.hlsUrl,
        durationSeconds: v.payload.durationSeconds,
        lang: v.output.lang,
        thumbnailUrl: v.payload.thumbnailUrl,
        aiPresenter: v.output.aiDisclosure !== false,
      },
    };
  }
  // Every OpenLens video uses a disclosed synthetic presenter.
  return { ...item, video: { url: item.videoUrl, aiPresenter: true } };
}

// ---------- Categories (CategoryNav) ----------

export type CategoryKey = 'top' | 'politics' | 'economy' | 'climate' | 'tech' | 'health' | 'society' | 'sport' | 'wire';

export const CATEGORIES: { key: CategoryKey; label: string; icon: string; topics: string[] }[] = [
  { key: 'top', label: 'Top', icon: 'flame-outline', topics: [] },
  { key: 'politics', label: 'Politics', icon: 'business-outline', topics: ['politics', 'civic'] },
  { key: 'economy', label: 'Economy', icon: 'trending-up-outline', topics: ['economy', 'trade'] },
  { key: 'climate', label: 'Climate & Disasters', icon: 'thunderstorm-outline', topics: ['climate', 'disaster'] },
  { key: 'tech', label: 'Tech', icon: 'hardware-chip-outline', topics: ['tech', 'technology'] },
  { key: 'health', label: 'Health', icon: 'medkit-outline', topics: ['health'] },
  { key: 'society', label: 'Society', icon: 'people-outline', topics: ['society', 'education', 'transport'] },
  { key: 'sport', label: 'Sport', icon: 'football-outline', topics: ['sport', 'sports'] },
  { key: 'wire', label: 'Wire', icon: 'list-outline', topics: [] },
];

export function inCategory(item: FeedItem, key: CategoryKey): boolean {
  const cat = CATEGORIES.find((c) => c.key === key);
  if (!cat || !cat.topics.length) return true;
  return item.topics.some((t) => cat.topics.includes(t.toLowerCase()));
}

// ---------- Editions (EditionSwitcher) ----------

export type Edition = { code: string; name: string; native: string };

/** '' = Asia-Pacific (every market). Subtitle = the market's languages in their own script. */
export const EDITIONS: Edition[] = [
  { code: '', name: 'Asia-Pacific', native: 'All markets · English desk' },
  ...MARKET_CODES.filter((m) => m !== 'APAC').map((code) => ({
    code,
    name: MARKETS[code].name,
    native: MARKETS[code].languages.map((l) => LANGUAGES[l].native).join(' · '),
  })),
];

export const editionName = (code: string) => EDITIONS.find((e) => e.code === code)?.name ?? MARKETS[marketOf(code) ?? 'APAC'].name;

/** Short market name for card metadata ("India", "Japan", "Asia-Pacific"). */
export function marketName(region: string): string {
  const m = marketOf(region);
  return m ? MARKETS[m].name : region;
}

export function languageNative(code?: string): string | undefined {
  return code && isLang(code) ? LANGUAGES[code].native : code;
}

// ---------- Sections ----------

export type RailSection = { key: string; title: string; icon: string; items: HomeItem[]; kind: 'video' | 'poster' | 'explainer' };

export type HomeSections = {
  spotlight?: HomeItem;
  spotlightList: HomeItem[];
  rails: RailSection[];
  all: HomeItem[];
};

const HOUR = 3600_000;

/** Spotlight score: recency × evidence × video availability (spec §4 Home). */
function spotlightScore(i: HomeItem, now: number): number {
  const ageH = Math.max(0, (now - Date.parse(i.updatedAt)) / HOUR);
  const recency = 1 / (1 + ageH / 12);
  const evidence = 1 + Math.min(i.evidence.supported, 6) / 6 - Math.min(i.evidence.unverified, 6) / 12;
  const video = i.video ? 1.5 : 1;
  return recency * evidence * video;
}

const newestFirst = (a: FeedItem, b: FeedItem) => b.updatedAt.localeCompare(a.updatedAt);

export function buildSections(
  feed: FeedItem[],
  opts: { region: string; category: CategoryKey; followedTopics: string[]; readerLang: string; now?: number },
): HomeSections {
  const now = opts.now ?? Date.now();
  const all = feed
    .filter((i) => matchesRegion(i.region, opts.region) && inCategory(i, opts.category))
    .map(toHomeItem)
    .sort(newestFirst);

  // Followed topics re-rank (never hide) the spotlight candidates.
  const followed = (i: FeedItem) => (i.topics.some((t) => opts.followedTopics.includes(t)) ? 1.25 : 1);
  const ranked = [...all].sort((a, b) => spotlightScore(b, now) * followed(b) - spotlightScore(a, now) * followed(a));
  const spotlight = ranked[0];
  const spotlightList = ranked.slice(1, 4);

  const rails: RailSection[] = [];
  const videos = all
    .filter((i) => i.video)
    // Reader's language first, then newest.
    .sort((a, b) => Number(b.languages.includes(opts.readerLang)) - Number(a.languages.includes(opts.readerLang)) || newestFirst(a, b));
  rails.push({ key: 'latest', title: 'Latest videos', icon: 'play-circle-outline', items: videos, kind: 'video' });
  rails.push({ key: 'explainers', title: 'Explainers', icon: 'reader-outline', items: all.filter((i) => !i.video), kind: 'explainer' });

  if (!opts.region) {
    // Asia-Pacific edition: one rail per market (region-wide desk first), in MARKETS order.
    for (const code of MARKET_CODES) {
      const items = all.filter((i) => marketOf(i.region) === code);
      rails.push({
        key: `market-${code}`,
        title: code === 'APAC' ? 'Across Asia-Pacific' : MARKETS[code as MarketCode].name,
        icon: code === 'APAC' ? 'globe-outline' : 'location-outline',
        items,
        kind: 'poster',
      });
    }
  } else {
    // Single edition: its topics instead of markets.
    const topics = [...new Set(all.flatMap((i) => i.topics))].sort();
    for (const t of topics) {
      rails.push({ key: `topic-${t}`, title: t[0].toUpperCase() + t.slice(1), icon: 'pricetag-outline', items: all.filter((i) => i.topics.includes(t)), kind: 'poster' });
    }
  }

  rails.push({ key: 'corrected', title: 'Corrected & updated', icon: 'refresh-circle-outline', items: all.filter((i) => i.corrected), kind: 'poster' });

  return { spotlight, spotlightList, rails: rails.filter((r) => r.items.length > 0), all };
}

/** Story ids for the watch pager (video items only, in rail order). */
export const videoIds = (items: HomeItem[]) => items.filter((i) => i.video).map((i) => i.id);
