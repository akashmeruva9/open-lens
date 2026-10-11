import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryView } from "@/components/story/story-view";
import { loadStory } from "@/lib/data/server";

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
  const res = await loadStory(id);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="font-serif text-2xl">This story could not be loaded.</p>
        <p className="mt-2 text-sm text-ink-3">({res.status}) {res.message.slice(0, 160)}</p>
      </div>
    );
  }
  return <StoryView initial={res.data} />;
}
