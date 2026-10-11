"use client";
import { useEffect, useRef, useState } from "react";
import { IconPlay } from "@/components/ui/icons";

/** MP4 player with HLS upgrade (native on Safari, hls.js elsewhere) and graceful fallback. */
export function VideoPlayer({
  mp4, hls, captions, poster, aspect, label, captionLang,
}: { mp4: string; hls?: string; captions?: string; poster?: string; aspect: "9:16" | "16:9"; label: string; captionLang: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const video = ref.current;
    if (!video) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;
    if (hls && !video.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) {
          video.src = mp4;
          return;
        }
        const h = new Hls({ capLevelToPlayerSize: true });
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            h.destroy();
            video.src = mp4; // fall back to progressive MP4
          }
        });
        h.loadSource(hls);
        h.attachMedia(video);
        destroy = () => h.destroy();
      });
    } else {
      video.src = hls ?? mp4;
    }
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [mp4, hls]);

  const ratio = aspect === "9:16" ? "aspect-[9/16] max-h-[70vh]" : "aspect-video";

  return (
    <div className={`relative mx-auto overflow-hidden rounded-xl bg-black ${ratio}`}>
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-neutral-900 to-neutral-800 p-6 text-center text-neutral-200">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-white/10"><IconPlay size={22} /></span>
          <p className="text-sm font-medium">Video unavailable right now</p>
          <p className="text-xs text-neutral-400">The rendered asset is served by the media pipeline. Read the transcript below.</p>
        </div>
      ) : null}
      <video
        ref={ref}
        className={`size-full object-contain ${failed ? "invisible" : ""}`}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        aria-label={label}
        onError={() => setFailed(true)}
        crossOrigin={captions ? "anonymous" : undefined}
      >
        {captions ? <track kind="captions" src={captions} srcLang={captionLang} label="Captions" default /> : null}
      </video>
    </div>
  );
}
