"use client";
import type { OutputRecord, ScriptPayload, VideoPayload } from "@openlens/schemas";
import { CarouselFrame, FbPostFrame, IgReelFrame, WaTemplateFrame, XThreadFrame } from "./frames/social-frames";
import { ScriptFrame, VideoFrame, YouTubeFrame } from "./frames/media-frames";

/* Payloads are `record<string, unknown>` in the contract; read fields defensively. */
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function OutputPreview({ output, all }: { output: OutputRecord; all: OutputRecord[] }) {
  const p = output.payload;
  const videoRef = str(p.videoOutputId);
  const linkedVideo = all.find((o) => o.id === videoRef);
  const videoLabel = linkedVideo ? `${linkedVideo.id} (${str(linkedVideo.payload.aspect)}, ${linkedVideo.payload.durationSeconds ?? "?"}s)` : videoRef || undefined;

  switch (output.kind) {
    case "yt_meta":
      return (
        <YouTubeFrame
          tier={str(p.tier, output.tier ?? "national")}
          title={str(p.title)}
          description={str(p.description)}
          tags={arr<string>(p.tags)}
          synthetic={p.containsSyntheticMedia === true}
          lang={output.lang}
          videoLabel={linkedVideo ? `0:${String(linkedVideo.payload.durationSeconds ?? 45).padStart(2, "0")}` : undefined}
        />
      );
    case "x_thread":
      return <XThreadFrame posts={arr<string>(p.posts)} video={videoLabel} />;
    case "ig_reel":
      return <IgReelFrame caption={str(p.caption)} hashtags={arr<string>(p.hashtags)} video={videoLabel} />;
    case "carousel":
      return <CarouselFrame slides={arr(p.slides)} caption={str(p.caption)} />;
    case "fb_post":
      return <FbPostFrame message={str(p.message)} link={str(p.link)} video={videoLabel} />;
    case "wa_digest":
      return <WaTemplateFrame templateName={str(p.templateName)} params={arr<string>(p.params)} previewText={str(p.previewText)} link={str(p.link)} lang={output.lang} />;
    case "script":
      return Array.isArray(p.lines) ? <ScriptFrame script={p as unknown as ScriptPayload} lang={output.lang} /> : <Raw p={p} />;
    case "video":
      return typeof p.mp4Url === "string" ? <VideoFrame video={p as unknown as VideoPayload} /> : <Raw p={p} />;
    default:
      return <Raw p={p} />;
  }
}

function Raw({ p }: { p: unknown }) {
  return <pre className="max-h-48 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px] text-ink-2">{JSON.stringify(p, null, 2)}</pre>;
}
