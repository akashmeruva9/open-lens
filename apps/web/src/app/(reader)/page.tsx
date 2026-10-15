import { HomeView } from "@/components/reader/home-view";
import { loadCards } from "@/lib/data/server";
import { readEdition } from "@/lib/edition-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [res, edition] = await Promise.all([loadCards(), readEdition()]);

  if (!res.ok) {
    return (
      <div className="page py-20">
        <div role="alert" className="mx-auto max-w-xl text-center">
          <h1 className="display text-[30px] leading-[34px]">The newsroom feed is unavailable right now.</h1>
          <p className="mt-2 text-sm text-ink-3">({res.status}) {res.message.slice(0, 160)}</p>
        </div>
      </div>
    );
  }
  return <HomeView initial={res.data} edition={edition} />;
}
