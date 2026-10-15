"use client";
import type { ScriptPayload, Tier, VideoPayload } from "@openlens/schemas";
import { IconSparkle } from "@/components/ui/icons";

const TIER_TONE: Record<string, string> = { regional: "#0f766e", national: "#7c3aed", international: "#0369a1" };

export function TierBadge({ tier }: { tier: Tier | string }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: TIER_TONE[tier] ?? "#555" }}>
      {tier}
    </span>
  );
}

// ---------- YouTube ----------
export function YouTubeFrame({
  tier, title, description, tags, synthetic, lang, videoLabel,
}: { tier: string; title: string; description: string; tags: string[]; synthetic: boolean; lang: string; videoLabel?: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white text-neutral-900 dark:bg-[#0f0f0f] dark:text-neutral-100" lang={lang}>
      <div className="relative flex aspect-video items-end bg-gradient-to-br from-[#0a0a0a] via-[#1f1f1f] to-[#1d3bb3] p-3">
        <span className="absolute left-2 top-2"><TierBadge tier={tier} /></span>
        {synthetic ? (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">AI presenter</span>
        ) : null}
        <p className="line-clamp-2 max-w-[80%] font-display text-lg font-semibold leading-tight text-white drop-shadow">{title}</p>
        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">{videoLabel ?? "0:45"}</span>
      </div>
      <div className="flex gap-2.5 p-3">
        <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white">OL</span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{title}</p>
          <p className="text-[12px] text-neutral-500">OpenLens {tier[0]?.toUpperCase() + tier.slice(1)} · {lang.toUpperCase()}</p>
        </div>
      </div>
      {synthetic ? (
        <div className="mx-3 mb-2 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <span className="font-semibold">Altered or synthetic content</span> · Sound or visuals were significantly edited or digitally generated.
          <span className="ml-1 font-mono text-[10px] text-neutral-500">containsSyntheticMedia=true</span>
        </div>
      ) : (
        <div className="mx-3 mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">Synthetic-media flag is OFF. Required for AI presenter videos.</div>
      )}
      <div className="mx-3 mb-3 rounded-lg bg-neutral-100 p-2.5 text-[12px] dark:bg-neutral-800">
        <p className="line-clamp-4 whitespace-pre-wrap">{description}</p>
        <p className="mt-1 text-[11px] text-[#065fd4] dark:text-[#3ea6ff]">{tags.map((t) => `#${t}`).join(" ")}</p>
        <p className="mt-1 text-right text-[10px] tabular-nums text-neutral-500">title {title.length}/100 · desc {description.length}/5000</p>
      </div>
    </div>
  );
}

// ---------- App: script & video ----------
export function ScriptFrame({ script, lang }: { script: ScriptPayload; lang: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3" lang={lang}>
      <p className="font-display font-semibold">{script.title}</p>
      <p className="text-[11px] text-ink-3">Presenter: {script.presenter} (fictional persona)</p>
      <ol className="mt-2 space-y-1.5">
        {script.lines.map((l, i) => (
          <li key={i} className="text-xs">
            <span className="font-semibold uppercase tracking-wider text-ink-3">{l.label}</span>
            <p className="text-ink-2">{l.text} <span className="text-ink-3">[{l.claimIds.join(", ")}]</span></p>
          </li>
        ))}
      </ol>
      {script.backTranslation ? (
        <p className="mt-2 text-[11px] text-ink-3">Back-translation fidelity: {Math.round(script.backTranslation.score * 100)}%{script.backTranslation.issues.length ? ` · ${script.backTranslation.issues.length} issues` : ""}</p>
      ) : null}
    </div>
  );
}

export function VideoFrame({ video }: { video: VideoPayload }) {
  const vertical = video.aspect === "9:16";
  return (
    <div className={`relative mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#0a0a0a] to-[#141a33] text-white ${vertical ? "aspect-[9/16] max-w-[180px]" : "aspect-video"}`}>
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold"><IconSparkle size={10} /> AI presenter</span>
      <span className="text-xs text-white/70">▶ {video.aspect} · {video.durationSeconds}s</span>
      <span className="absolute bottom-2 left-2 right-2 truncate text-[10px] text-white/50">{video.hlsUrl ? "HLS + MP4" : "MP4"} · captions {video.captionsVttUrl ? "✓" : "—"}</span>
    </div>
  );
}
