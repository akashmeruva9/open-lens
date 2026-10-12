"use client";
import { matchesRegion } from "@/lib/format";
import type { FeedItem } from "@openlens/schemas";
import { useLiveFeed } from "@/lib/data/live";
import { FeedCard } from "./feed-card";

export function FeedList({ initial, lang, region }: { initial: FeedItem[]; lang?: string; region?: string }) {
  const items = useLiveFeed(
    initial,
    (f) => (!lang || f.languages.includes(lang)) && (!region || matchesRegion(f.region, region)),
  );
  if (!items.length) {
    return (
      <div className="card p-8 text-center text-ink-2">
        <p className="font-serif text-lg text-ink">No stories match these filters.</p>
        <p className="mt-1 text-sm">Try another language or region.</p>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-4" aria-label="Stories">
      {items.map((item, i) => (
        <li key={item.id}>
          <FeedCard item={item} lead={i === 0} />
        </li>
      ))}
    </ol>
  );
}
