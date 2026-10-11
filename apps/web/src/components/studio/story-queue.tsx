"use client";
import type { Story } from "@openlens/schemas";
import Link from "next/link";
import { useState } from "react";
import { StoryStatusPill, Tag } from "@/components/ui/chips";
import { RelTime } from "@/components/ui/time";
import { useClient, useLoad, useStoryEvents } from "@/lib/data/browser";
import { regionName } from "@/lib/format";
import { STORY_STATUS } from "@/lib/meta";
import { PipelineProgress } from "./pipeline-progress";

export function StoryQueue() {
  const client = useClient();
  const { data, error, loading } = useLoad(() => client.studio.stories(), [client]);
  const [filter, setFilter] = useState("all");
  const stories = (data ?? []).filter((s) => filter === "all" || s.status === filter);
  const counts = (data ?? []).reduce<Record<string, number>>((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {});

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Newsroom</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Story queue</h1>
        </div>
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {["all", ...Object.keys(STORY_STATUS).filter((s) => counts[s])].map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === s ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-surface-2"}`}>
              {s === "all" ? `All ${data?.length ?? ""}` : `${STORY_STATUS[s].label} ${counts[s]}`}
            </button>
          ))}
        </div>
      </div>

      {error ? <p role="alert" className="mt-6 card p-4 text-sm text-[var(--st-bad)]">Could not load stories: {error}</p> : null}
      {loading && !data ? <SkeletonRows /> : null}

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {stories.map((s) => (
          <QueueRow key={s.id} story={s} />
        ))}
        {data && !stories.length ? <li className="p-8 text-center text-sm text-ink-3">No stories in this state.</li> : null}
      </ul>
    </div>
  );
}

function QueueRow({ story }: { story: Story }) {
  // Only subscribe to SSE while a story is actively in the pipeline.
  const active = story.status === "researching" || story.status === "draft";
  const { stages, connected, live } = useStoryEvents(active ? story.id : null);
  return (
    <li className="relative grid gap-3 p-4 hover:bg-surface-2/50 md:grid-cols-[minmax(0,1fr)_220px_140px] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StoryStatusPill status={story.status} />
          {story.riskTier === "sensitive" ? <Tag>Sensitive · human gate</Tag> : null}
          <span className="text-xs text-ink-3">{regionName(story.region)}</span>
        </div>
        <Link href={`/studio/${story.id}`} className="mt-1 block font-serif text-lg font-semibold leading-snug text-ink after:absolute after:inset-0 hover:underline">
          {story.title}
        </Link>
        <p className="mt-0.5 text-xs text-ink-3">
          Ledger v{story.version} · {story.languages.join(", ").toUpperCase()} · {story.topics.join(", ")}
        </p>
      </div>
      <div>
        <PipelineProgress status={story.status} stages={stages} compact />
        {active && live ? <p className="mt-0.5 text-[10px] text-ink-3">{connected ? "● live" : "○ connecting…"}</p> : null}
      </div>
      <p className="text-xs text-ink-3 md:text-right"><RelTime iso={story.updatedAt} prefix="Updated " /></p>
    </li>
  );
}

function SkeletonRows() {
  return (
    <div className="mt-6 space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}
