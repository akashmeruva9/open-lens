"use client";
import type { StoryBundle } from "@openlens/schemas";
import { useState } from "react";
import { CHANNEL, OUTPUT_STATUS } from "@/lib/meta";
import { OutputCard, type ChannelState } from "./output-card";

const ORDER = ["youtube", "x", "instagram", "facebook", "whatsapp", "app"];

export function ChannelsTab({
  bundle, channels, highlighted, actions,
}: {
  bundle: StoryBundle;
  channels: Record<string, ChannelState>;
  highlighted: Set<string>;
  actions: React.ComponentProps<typeof OutputCard>["actions"];
}) {
  const [channel, setChannel] = useState<string>("all");
  const present = ORDER.filter((c) => bundle.outputs.some((o) => o.channel === c));
  const outputs = bundle.outputs
    .filter((o) => channel === "all" || o.channel === channel)
    .sort((a, b) => ORDER.indexOf(a.channel) - ORDER.indexOf(b.channel));
  const statusCounts = bundle.outputs.reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] ?? 0) + 1 }), {});

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by channel" className="flex flex-wrap gap-1">
          {["all", ...present].map((c) => (
            <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${channel === c ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-surface-2"}`}>
              {c === "all" ? `All ${bundle.outputs.length}` : CHANNEL[c]?.label ?? c}
              {c !== "all" && channels[c]?.live ? <span className="ml-1 text-[var(--st-ok)]">●</span> : null}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          {Object.entries(statusCounts).map(([s, n]) => `${n} ${OUTPUT_STATUS[s]?.label.toLowerCase() ?? s}`).join(" · ")} · all from ledger v{bundle.story.version}
        </p>
      </div>
      {outputs.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {outputs.map((o) => (
            <OutputCard
              key={o.id}
              output={o}
              all={bundle.outputs}
              storyVersion={bundle.story.version}
              publications={bundle.publications.filter((p) => p.outputId === o.id)}
              channel={channels[o.channel]}
              highlighted={highlighted.has(o.id)}
              actions={actions}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-3">No channel outputs generated yet.</p>
      )}
    </div>
  );
}
