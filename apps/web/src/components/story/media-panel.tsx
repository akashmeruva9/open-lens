"use client";
import { AI_DISCLOSURE } from "@openlens/config";
import type { OutputRecord, ScriptPayload, VideoPayload } from "@openlens/schemas";
import { useMemo, useState } from "react";
import { PosterFrame } from "@/components/reader/story-card";
import { IconChevronDown, IconSparkle } from "@/components/ui/icons";
import { toCard } from "@/lib/cards";
import { feedItemFromBundle } from "@/lib/data/derive";
import { langName, langNative } from "@/lib/format";
import { ClaimRefs } from "./claim-ref";
import { useStory } from "./story-context";
import { VideoPlayer } from "./video-player";

const asVideo = (o: OutputRecord) => o.payload as unknown as VideoPayload;
const asScript = (o: OutputRecord) => o.payload as unknown as ScriptPayload;

/**
 * Vertical video stage: 9:16 player (max 80vh, captions on), language pills, AI-disclosure line, transcript.
 * Without a playable video it shows the story's poster frame.
 */
export function MediaPanel({ assetUrl }: { assetUrl: (p: string) => string }) {
  const { bundle } = useStory();
  const videos = bundle.outputs.filter((o) => o.kind === "video" && typeof o.payload.mp4Url === "string");
  const scripts = bundle.outputs.filter((o) => o.kind === "script" && Array.isArray(o.payload.lines));
  const langs = useMemo(() => [...new Set([...videos.map((v) => v.lang), ...scripts.map((s) => s.lang)])], [videos, scripts]);
  const [lang, setLang] = useState(() => (langs.includes("en") ? "en" : langs[0]));
  const [showTranscript, setShowTranscript] = useState(false);
  const card = useMemo(() => toCard(feedItemFromBundle(bundle), bundle), [bundle]);

  const frame = "aspect-[9/16] max-h-[70vh] w-full rounded-none sm:max-h-[80vh] sm:rounded-lg";
  if (!langs.length) {
    return <PosterFrame card={card} size="hero" className={`${frame} !aspect-[4/5] sm:!aspect-[2/3]`} />;
  }
  const video = videos.find((v) => v.lang === lang && asVideo(v).aspect === "9:16") ?? videos.find((v) => v.lang === lang);
  const script = scripts.find((s) => s.lang === lang) ?? (video ? scripts.find((s) => s.id === asVideo(video).scriptOutputId) : undefined);
  const disclosed = (video?.aiDisclosure ?? false) || (script?.aiDisclosure ?? false);
  const vp = video ? asVideo(video) : undefined;
  const captions = vp ? (vp.captionTracks?.[lang] ?? vp.captionsVttUrl) : undefined;
  const cardVideo = vp ? { lang, durationSeconds: vp.durationSeconds, aiPresenter: video!.aiDisclosure } : undefined;

  return (
    <section aria-label="Video brief">
      {video && vp ? (
        <VideoPlayer
          key={video.id}
          mp4={assetUrl(vp.mp4Url)}
          hls={vp.hlsUrl ? assetUrl(vp.hlsUrl) : undefined}
          captions={captions ? assetUrl(captions) : undefined}
          poster={vp.thumbnailUrl ? assetUrl(vp.thumbnailUrl) : undefined}
          aspect={vp.aspect}
          label={`Video brief in ${langName(lang)}`}
          captionLang={lang}
          className="rounded-none sm:rounded-lg"
          fallback={
            <div>
              <PosterFrame card={card} video={cardVideo} size="hero" className={`${frame} mx-auto max-w-[calc(80vh*9/16)]`} />
              <p className="mt-2 px-4 text-xs text-ink-3 sm:px-0">The video file isn&apos;t reachable from here. The transcript below carries the same claims.</p>
            </div>
          }
        />
      ) : (
        <div>
          <PosterFrame card={card} size="hero" className={`${frame} !aspect-[4/5] sm:!aspect-[2/3]`} />
          <p className="mt-2 px-4 text-xs text-ink-3 sm:px-0">No rendered video in {langName(lang)} yet. Transcript available below.</p>
        </div>
      )}

      <div className="px-4 sm:px-0">
        {langs.length > 1 ? (
          <div role="radiogroup" aria-label="Video language" className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
            {langs.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={l === lang}
                onClick={() => setLang(l)}
                title={langName(l)}
                lang={l}
                className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${l === lang ? "bg-ink text-bg" : "bg-surface text-ink hover:bg-surface-2"}`}
              >
                {langNative(l)}
              </button>
            ))}
          </div>
        ) : null}

        {disclosed ? (
          <p className="mt-3 flex items-start gap-2 text-xs leading-[18px] text-ink-2">
            <IconSparkle size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong className="font-semibold text-ink">AI-generated presenter and narration.</strong> The presenter is a fictional, disclosed persona; the voice is synthetic and visuals are rendered from the ledger, not real footage.
              {lang !== "en" && AI_DISCLOSURE[lang] ? <span lang={lang} className="mt-1 block text-ink-3">{AI_DISCLOSURE[lang]}</span> : null}
            </span>
          </p>
        ) : null}

        {script ? (
          <div className="mt-3 border-t border-line">
            <button type="button" aria-expanded={showTranscript} aria-controls="transcript" onClick={() => setShowTranscript((v) => !v)}
              className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-ink hover:text-accent">
              <span>Transcript · {langName(lang)}</span>
              <IconChevronDown size={18} className={`text-ink-3 transition-transform ${showTranscript ? "rotate-180" : ""}`} />
            </button>
            {showTranscript ? (
              <ol id="transcript" lang={lang} className="space-y-3 pb-4">
                <li className="display text-[17px] text-ink">{asScript(script).title}</li>
                {asScript(script).lines.map((line, i) => (
                  <li key={i}>
                    <p className="eyebrow">{line.label}</p>
                    <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">
                      {line.text} <ClaimRefs ids={line.claimIds} className="align-middle" />
                    </p>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
