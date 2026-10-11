import { Suspense } from "react";
import { FeedFilters } from "@/components/reader/feed-filters";
import { FeedList } from "@/components/reader/feed-list";
import { loadFeed } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lang = typeof sp.lang === "string" ? sp.lang : undefined;
  const region = typeof sp.region === "string" ? sp.region : undefined;
  const res = await loadFeed({ lang, region });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6 pt-6 sm:pt-10">
      <section aria-labelledby="feed-title" className="mb-6">
        <p className="eyebrow">Today · evidence-first briefings</p>
        <h1 id="feed-title" className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          News you can inspect.
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-ink-2">
          Each story is built from a reviewed ledger of claims and sources. Swipe to compare perspectives, then open the research.
        </p>
        <div className="mt-4">
          <Suspense fallback={<div className="h-9" />}>
            <FeedFilters />
          </Suspense>
        </div>
      </section>

      {res.ok ? (
        <FeedList initial={res.data} lang={lang} region={region} />
      ) : (
        <div role="alert" className="card p-6 text-ink-2">
          <p className="font-semibold text-ink">The newsroom feed is unavailable right now.</p>
          <p className="mt-1 text-sm">({res.status}) {res.message.slice(0, 160)}</p>
        </div>
      )}
    </div>
  );
}
