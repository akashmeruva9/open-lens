"use client";
import type { OutputRecord, ScriptPayload, VideoPayload } from "@openlens/schemas";
import { useMemo, useState } from "react";
import { IconSparkle } from "@/components/ui/icons";
import { langName, langNative } from "@/lib/format";
import { ClaimRefs } from "./claim-ref";
import { useStory } from "./story-context";
import { VideoPlayer } from "./video-player";

const asVideo = (o: OutputRecord) => o.payload as unknown as VideoPayload;
const asScript = (o: OutputRecord) => o.payload as unknown as ScriptPayload;

export function MediaPanel({ assetUrl }: { assetUrl: (p: string) => string }) {
  const { bundle } = useStory();
  const videos = bundle.outputs.filter((o) => o.kind === "video" && typeof o.payload.mp4Url === "string");
  const scripts = bundle.outputs.filter((o) => o.kind === "script" && Array.isArray(o.payload.lines));
  const langs = useMemo(() => [...new Set([...videos.map((v) => v.lang), ...scripts.map((s) => s.lang)])], [videos, scripts]);
  const [lang, setLang] = useState(() => (langs.includes("en") ? "en" : langs[0]));
  const [showTranscript, setShowTranscript] = useState(false);

  if (!langs.length) return null;
  const video = videos.find((v) => v.lang === lang && asVideo(v).aspect === "9:16") ?? videos.find((v) => v.lang === lang);
  const script = scripts.find((s) => s.lang === lang) ?? (video ? scripts.find((s) => s.id === asVideo(video).scriptOutputId) : undefined);
  const disclosed = (video?.aiDisclosure ?? false) || (script?.aiDisclosure ?? false);

  return (
    <section aria-labelledby="media-title" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="media-title" className="text-sm font-semibold">Video brief</h2>
        <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-1">
          {langs.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === lang}
              onClick={() => setLang(l)}
              title={langName(l)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${l === lang ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"}`}
            >
              {langNative(l)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        {video ? (
          <VideoPlayer
            key={video.id}
            mp4={assetUrl(asVideo(video).mp4Url)}
            hls={asVideo(video).hlsUrl ? assetUrl(asVideo(video).hlsUrl!) : undefined}
            captions={asVideo(video).captionsVttUrl ? assetUrl(asVideo(video).captionsVttUrl!) : undefined}
            poster={asVideo(video).thumbnailUrl ? assetUrl(asVideo(video).thumbnailUrl!) : undefined}
            aspect={asVideo(video).aspect}
            label={`Video brief in ${langName(lang)}`}
            captionLang={lang}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-ink-3">
            No rendered video in {langName(lang)} yet. Transcript available below.
          </p>
        )}
        {disclosed ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <IconSparkle size={14} className="mt-px shrink-0 text-brand" />
            <span><strong className="font-semibold text-ink">AI-generated presenter / narration.</strong> The presenter is a fictional persona; voice is synthetic. Visuals are rendered from the ledger, not real footage.</span>
          </p>
        ) : null}
      </div>

      {script ? (
        <div className="border-t border-line">
          <button type="button" aria-expanded={showTranscript} aria-controls="transcript" onClick={() => setShowTranscript((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-surface-2">
            <span>Transcript · {langName(lang)}</span>
            <span className="text-xs text-ink-3">{showTranscript ? "Hide" : "Show"}</span>
          </button>
          {showTranscript ? (
            <ol id="transcript" lang={lang} className="space-y-3 px-4 pb-4">
              <li className="font-serif text-base font-semibold text-ink">{asScript(script).title}</li>
              {asScript(script).lines.map((line, i) => (
                <li key={i}>
                  <p className="eyebrow">{line.label}</p>
                  <p className="mt-0.5 text-[15px] leading-relaxed text-ink-2">
                    {line.text} <ClaimRefs ids={line.claimIds} className="align-middle" />
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
