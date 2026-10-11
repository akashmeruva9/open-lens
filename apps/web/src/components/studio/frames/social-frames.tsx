"use client";
// Realistic-but-generic platform previews. No platform logos/branding are reproduced; the
// frames mimic layout only so editors can judge length, truncation and disclosure placement.
import { IconBookmark, IconHeart, IconMessage, IconMore, IconRepeat, IconSend, IconShare } from "@/components/ui/icons";
import { hostname } from "@/lib/format";

const AVATAR = (
  <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-bold text-white ring-2 ring-[#ea580c]">
    OL
  </span>
);

// ---------- X thread ----------
export function XThreadFrame({ posts, video }: { posts: string[]; video?: string }) {
  return (
    <div className="rounded-xl bg-white p-3 text-[14px] text-neutral-900 dark:bg-black dark:text-neutral-100">
      <ol>
        {posts.map((p, i) => (
          <li key={i} className="relative flex gap-2.5 pb-3">
            {i < posts.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[17px] top-10 w-0.5 bg-neutral-200 dark:bg-neutral-800" /> : null}
            {AVATAR}
            <div className="min-w-0 flex-1">
              <p className="text-[13px]"><span className="font-bold">OpenLens</span> <span className="text-neutral-500">@openlens_news · now</span></p>
              <p className="mt-0.5 whitespace-pre-wrap break-words leading-snug">{p}</p>
              {i === 0 && video ? (
                <div className="mt-2 flex aspect-video items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                  ▶ {video}
                </div>
              ) : null}
              <div className="mt-1.5 flex items-center justify-between pr-6 text-neutral-500">
                <IconMessage size={15} /><IconRepeat size={15} /><IconHeart size={15} /><IconBookmark size={15} />
                <span className={`text-[11px] tabular-nums ${p.length > 280 ? "font-bold text-red-600" : ""}`}>{p.length}/280</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------- Instagram Reel ----------
export function IgReelFrame({ caption, hashtags, video }: { caption: string; hashtags: string[]; video?: string }) {
  return (
    <div className="mx-auto w-full max-w-[260px]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[22px] border-4 border-neutral-900 bg-gradient-to-b from-[#1f2937] via-[#3b2a20] to-[#7c2d12] text-white shadow-lg">
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-xs font-semibold">
          <span>Reels</span>
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">AI info</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">▶ {video ?? "video"}</div>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-white text-[9px] font-bold text-black">OL</span>
            openlens.news <span className="rounded border border-white/60 px-1 text-[10px]">Follow</span>
          </p>
          <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug">{caption}</p>
          <p className="mt-1 text-[11px] text-sky-200">{hashtags.join(" ")}</p>
        </div>
        <div className="absolute bottom-24 right-2 flex flex-col items-center gap-3 text-white">
          <IconHeart size={18} /><IconMessage size={18} /><IconSend size={18} /><IconMore size={18} />
        </div>
      </div>
      <p className="mt-1 text-right text-[11px] tabular-nums text-ink-3">{caption.length}/2200 chars</p>
    </div>
  );
}

// ---------- Carousel ----------
export function CarouselFrame({ slides, caption }: { slides: { heading: string; body: string; claimIds: string[] }[]; caption: string }) {
  return (
    <div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
        {slides.map((s, i) => (
          <div key={i} className="flex aspect-square w-[200px] shrink-0 snap-start flex-col justify-between rounded-lg bg-[#16181d] p-4 text-[#f7f5f0]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#fb923c]">OpenLens · {i + 1}/{slides.length}</span>
            <div>
              <p className="font-serif text-lg font-semibold leading-tight">{s.heading}</p>
              <p className="mt-1 text-xs leading-snug text-white/75">{s.body}</p>
            </div>
            <span className="text-[9px] text-white/50">Claims: {s.claimIds.join(", ")}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 line-clamp-3 text-xs text-ink-2">{caption}</p>
    </div>
  );
}

// ---------- Facebook post ----------
export function FbPostFrame({ message, link, video }: { message: string; link: string; video?: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white text-[14px] text-neutral-900 shadow-sm dark:bg-[#242526] dark:text-neutral-100">
      <div className="flex items-center gap-2 p-3">
        {AVATAR}
        <div className="flex-1">
          <p className="text-[13px] font-semibold">OpenLens News</p>
          <p className="text-[11px] text-neutral-500">Just now · 🌐</p>
        </div>
        <IconMore size={16} className="text-neutral-500" />
      </div>
      <p className="whitespace-pre-wrap px-3 pb-3 leading-snug">{message}</p>
      {video ? (
        <div className="flex aspect-video items-center justify-center bg-neutral-200 text-xs text-neutral-500 dark:bg-neutral-800">▶ {video}</div>
      ) : (
        <div className="border-y border-neutral-200 bg-neutral-100 px-3 py-2.5 dark:border-neutral-700 dark:bg-[#3a3b3c]">
          <p className="text-[11px] uppercase text-neutral-500">{hostname(link)}</p>
          <p className="text-[14px] font-semibold">Read the evidence on OpenLens</p>
        </div>
      )}
      <div className="flex justify-around py-2 text-[12px] font-medium text-neutral-500">
        <span className="inline-flex items-center gap-1"><IconHeart size={14} /> Like</span>
        <span className="inline-flex items-center gap-1"><IconMessage size={14} /> Comment</span>
        <span className="inline-flex items-center gap-1"><IconShare size={14} /> Share</span>
      </div>
    </div>
  );
}

// ---------- WhatsApp template ----------
export function WaTemplateFrame({ templateName, params, previewText, link, lang }: { templateName: string; params: string[]; previewText: string; link: string; lang: string }) {
  return (
    <div className="rounded-xl bg-[#efe7dd] p-3 dark:bg-[#0b141a]">
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-[#075e54] px-3 py-2 text-white">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">OL</span>
        <div>
          <p className="text-[13px] font-semibold">OpenLens Digest</p>
          <p className="text-[10px] text-white/70">Business account · opt-in</p>
        </div>
      </div>
      <div className="ml-auto max-w-[88%] rounded-lg rounded-tl-none bg-white p-2.5 text-[13px] text-neutral-900 shadow-sm dark:bg-[#202c33] dark:text-neutral-100" lang={lang}>
        <p className="whitespace-pre-wrap leading-snug">{previewText}</p>
        <p className="mt-1 text-right text-[10px] text-neutral-500">09:00</p>
        <div className="mt-1 border-t border-neutral-200 pt-1.5 text-center text-[13px] font-medium text-[#027eb5] dark:border-neutral-700">
          ↗ Open story
        </div>
      </div>
      <dl className="mt-2 space-y-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
        <div><dt className="inline font-semibold">Template:</dt> <dd className="inline font-mono">{templateName}</dd></div>
        <div><dt className="inline font-semibold">Params:</dt> <dd className="inline">{params.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ")}</dd></div>
        <div><dt className="inline font-semibold">Link:</dt> <dd className="inline">{link}</dd></div>
        <div><dt className="inline font-semibold">Body:</dt> <dd className="inline tabular-nums">{previewText.length}/1024</dd></div>
      </dl>
    </div>
  );
}
