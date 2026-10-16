import { AI_DISCLOSURE, CHANNEL_PLAN, LANGUAGES, PRESENTERS, isLang, uiStrings, type PresenterId } from "@openlens/config";
import type { ScriptPayload } from "@openlens/schemas";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fontFor, registerDefaultFonts } from "./fonts.js";
import { beatCandidates, pickBeat, type Beat, type BeatClaim, type BeatHint, type BeatKind } from "./beats.js";
import { run, renderVideo, type HookClip } from "./render.js";
import { loadPresenter, type Aspect, type Scene } from "./scenes.js";
import { synthesizeToFile } from "./tts.js";
import { planFilePhotos } from "./imagedesk.js";
import { pickIllustrationLines, planIllustrations } from "./visuals.js";

export interface MediaJob {
  /** e.g. "national-en" — used in file names. */
  key: string;
  lang: string;
  script: ScriptPayload;
  outDir: string;
  aspects?: Aspect[];
  /** Skip TTS (silent track, estimated timings) — for tests/offline. */
  silent?: boolean;
  presenterImagePath?: string;
  /** claimId -> outlet names, for the on-screen source chip. */
  sourceLabels?: Record<string, string[]>;
  /** lang -> line texts (same line order as `script`), for extra subtitle tracks timed to this video. */
  captionTracks?: Record<string, string[]>;
  /** "explainer" (default): beat cards + captions + presenter picture-in-picture. "tv": the older anchor/split look. */
  style?: "explainer" | "tv";
  /** Ledger claims (claimId -> text/attribution/state). Number and attributed-statement cards are only possible with
   *  these: a figure is shown only if its digits appear in one of the line's own safe claims. */
  claims?: Record<string, BeatClaim>;
  /** Story timeline (for timeline cards). */
  timeline?: { date: string; text: string; claimIds?: string[] }[];
  /** Language the ledger/timeline text is written in (default "en"); timeline text is only shown in that language. */
  ledgerLang?: string;
  /** End-card QR/link target. Defaults to OPENLENS_PUBLIC_URL; without either the end card shows a placeholder. */
  ctaUrl?: string;
  /** Story id (names the folder for generated images). Needed for `autoIllustrations`. */
  storyId?: string;
  /** Generate up to N realistic backdrops (about US$0.035 each + one Gemini call) for lines with nothing numeric to show. 0 = off. */
  autoIllustrations?: number;
  /** Real licensed file photos (Wikimedia Commons, verified by Gemini) of subjects the lines name, with a credit line. 0 = off. Tried before AI backdrops. */
  autoPhotos?: number;
  /** Credit line per script line index for file photos (shown as "File photo · credit"). */
  imageCredits?: Record<number, string>;
  /** Optional supplied illustrations, by script line index (image file paths). Shown full-bleed with an
   *  "AI-generated illustration" label; never invented here. */
  illustrations?: Record<number, string>;
  /** Hook for an LLM-chosen beat per line index. Honoured only when the deterministic rules also allow that beat. */
  beatHints?: (BeatHint | undefined)[];
  /** Optional intro clip (presenter speaking, own audio), e.g. from Veo. Prepended before the first line. */
  hookClipPath?: string;
  /** Seconds of the hook clip to use (required with hookClipPath; ignored when <= 0). */
  hookSeconds?: number;
  /** What is said in the hook clip: shown as its caption and added as the first caption cue. */
  hookText?: string;
}

export interface MediaResult {
  audio: { path: string; durationSeconds: number; transcript: string };
  captionsVtt: string;
  /** Subtitle tracks (own language first), each timed to this video. */
  captionTracks: { lang: string; path: string }[];
  videos: { aspect: Aspect; mp4: string; hls?: string; thumbnail: string; durationSeconds: number }[];
  /** Beat chosen for each script line (explainer style), for logs and review. */
  beats?: BeatKind[];
}

/** Repo portrait for a presenter (data/presenters/<id>.png) when it exists. */
const defaultPortrait = (id: string) => {
  const p = resolve(import.meta.dirname, "../../../data/presenters", `${id}.png`);
  return existsSync(p) ? p : undefined;
};

/** Repo idle clip for a presenter (data/presenters/<id>.idle.mp4) when it exists. */
const defaultIdleClip = (id: string) => {
  const p = resolve(import.meta.dirname, "../../../data/presenters", `${id}.idle.mp4`);
  return existsSync(p) && process.env.PRESENTER_VIDEO !== "0" ? p : undefined;
};

const fmt = (t: number) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
};

/** ISO 639-2 codes for MP4 subtitle track metadata. */
const ISO3: Record<string, string> = { en: "eng", hi: "hin", te: "tel", ta: "tam", ja: "jpn", ko: "kor", "zh-Hant": "zho", "zh-Hans": "zho", id: "ind", ms: "msa", th: "tha", vi: "vie", fil: "fil" };

/** WebVTT with one cue per spoken line. A cue starts when its line starts and ends when that line's narration ends
 *  (`spoken[i]`, the exact TTS duration); the pause after a line belongs to no cue. `seconds[i]` is the line's slot
 *  (narration + pause). `offset` shifts everything (e.g. after a hook intro); `lead` adds cues before the lines. */
export function toCuesVtt(
  texts: string[], seconds: number[], spoken?: number[],
  opts: { offset?: number; lead?: { text: string; start: number; end: number }[] } = {},
): string {
  const cues: string[] = [];
  for (const c of opts.lead ?? []) cues.push(`${cues.length + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`);
  let t = opts.offset ?? 0;
  texts.forEach((text, i) => {
    const slot = seconds[i]!;
    const end = t + Math.min(slot, spoken?.[i] ?? slot);
    if (text.trim()) cues.push(`${cues.length + 1}\n${fmt(t)} --> ${fmt(end)}\n${text.trim()}\n`);
    t += slot;
  });
  return `WEBVTT\n\n${cues.join("\n")}`;
}

/** Words-per-second estimate used when TTS is skipped. */
const estimate = (text: string) => Math.max(2.5, [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)].filter((s) => s.isWordLike).length / 2.6);

export function toVtt(lines: { text: string; seconds: number }[]): string {
  let t = 0;
  const cues = lines.map((l, i) => {
    const cue = `${i + 1}\n${fmt(t)} --> ${fmt(t + l.seconds)}\n${l.text}\n`;
    t += l.seconds;
    return cue;
  });
  return `WEBVTT\n\n${cues.join("\n")}`;
}

/** Script -> per-line TTS -> narration track + captions -> 9:16 / 16:9 videos (+HLS). */
export async function renderScriptMedia(job: MediaJob): Promise<MediaResult> {
  registerDefaultFonts();
  const dir = join(job.outDir, job.key);
  await mkdir(dir, { recursive: true });
  // A renamed/unknown presenter id falls back to the language's channel presenter.
  const presenter = (job.script.presenter in PRESENTERS ? job.script.presenter : isLang(job.lang) ? CHANNEL_PLAN[job.lang].presenter : "maya-apac") as PresenterId;
  const persona = PRESENTERS[presenter];
  const GAP = 0.35;

  // 1) Narration per line so scene timing follows real audio.
  const timed: { text: string; label: string; claimIds: string[]; seconds: number; spoken: number; wav?: string }[] = [];
  for (const [i, l] of job.script.lines.entries()) {
    if (job.silent) {
      const e = estimate(l.text);
      timed.push({ ...l, seconds: e, spoken: e });
    } else {
      const wav = join(dir, `line-${i}.wav`);
      const d = await synthesizeToFile(l.text, presenter, wav);
      timed.push({ ...l, seconds: d + GAP, spoken: d, wav });
    }
  }

  // 2) Concatenate narration (with short gaps) into one track.
  const audioPath = join(dir, "narration.m4a");
  if (!job.silent) {
    const inputs = timed.flatMap((t) => ["-i", t.wav!]);
    const pads = timed.map((_, i) => `[${i}:a]aresample=44100,apad=pad_dur=${GAP}[a${i}]`).join(";");
    const cat = `${timed.map((_, i) => `[a${i}]`).join("")}concat=n=${timed.length}:v=0:a=1[out]`;
    await run("ffmpeg", ["-y", ...inputs, "-filter_complex", `${pads};${cat}`, "-map", "[out]", "-c:a", "aac", "-b:a", "128k", audioPath]);
  }
  const total = timed.reduce((s, t) => s + t.seconds, 0);

  // Optional hook intro (prepended): captions and beats start after it.
  const hook: HookClip | undefined =
    job.hookClipPath && (job.hookSeconds ?? 0) > 0 ? { path: job.hookClipPath, seconds: job.hookSeconds!, text: job.hookText } : undefined;
  const cueOpts = { offset: hook?.seconds ?? 0, lead: hook?.text ? [{ text: hook.text, start: 0, end: hook.seconds }] : [] };

  // 3) Captions: one cue per spoken line, timed by that line's real narration length.
  const captionsVtt = join(dir, "captions.vtt");
  const secs = timed.map((t) => t.seconds);
  const spoken = timed.map((t) => t.spoken);
  await writeFile(captionsVtt, toCuesVtt(timed.map((t) => t.text), secs, spoken, cueOpts));
  const captionTracks: { lang: string; path: string }[] = [{ lang: job.lang, path: captionsVtt }];
  for (const [lang, texts] of Object.entries(job.captionTracks ?? {})) {
    if (lang === job.lang || texts.length !== timed.length) continue; // only line-aligned scripts
    const path = join(dir, `captions.${lang}.vtt`);
    // Other languages: same slots as this video; no hook cue (its text is in this video's language only).
    await writeFile(path, toCuesVtt(texts, secs, spoken, { offset: cueOpts.offset }));
    captionTracks.push({ lang, path });
  }

  // 4) Videos.
  // A missing portrait renders a blank anchor area (this shipped to Cloud Run once: assets were not in the image).
  if (!job.presenterImagePath && !defaultPortrait(presenter)) {
    const msg = `presenter "${presenter}" has no portrait (data/presenters/${presenter}.png); the video would have no avatar`;
    if (process.env.REQUIRE_PRESENTER === "1") throw new Error(msg);
    console.warn(`[media] WARNING: ${msg}`);
  }
  const brand = {
    title: job.script.title,
    disclosure: AI_DISCLOSURE[job.lang] ?? AI_DISCLOSURE.en!,
    fontFamily: fontFor(job.lang),
    lang: job.lang,
    presenterName: persona?.name,
    presenterImage: await loadPresenter(job.presenterImagePath ?? defaultPortrait(presenter)),
    presenterVideo: defaultIdleClip(presenter),
  };
  if (job.style !== "tv" && !job.illustrations && ((job.autoIllustrations ?? 0) > 0 || (job.autoPhotos ?? 0) > 0) && job.storyId) {
    const ctaUrl = job.ctaUrl ?? (process.env.OPENLENS_PUBLIC_URL?.trim() || undefined);
    const kinds = timed.map((t, i) => beatCandidates({ label: t.label, text: t.text, claimIds: t.claimIds },
      { claims: job.claims, sources: outletsFor(job, t.claimIds), timeline: job.timeline, timelineLang: job.ledgerLang ?? "en", lang: job.lang, index: i, total: timed.length, ctaUrl })[0]?.kind);
    const plain = pickIllustrationLines(kinds, timed.length); // every line that would otherwise get a plain card (never the end card)
    const illustrations: Record<number, string> = {};
    const credits: Record<number, string> = {};
    // 1) Real file photos for lines that name a subject (people, organisations, objects), with a visible credit.
    if ((job.autoPhotos ?? 0) > 0 && plain.length) {
      const photos = await planFilePhotos({ storyId: job.storyId, title: job.script.title, lines: plain.map((i) => ({ index: i, text: timed[i]!.text })), max: job.autoPhotos! });
      for (const [i, p] of Object.entries(photos)) { illustrations[Number(i)] = p.file; credits[Number(i)] = p.credit; }
    }
    // 2) AI backdrops (labelled) for remaining plain lines, up to the configured count.
    const remaining = plain.filter((i) => !(i in illustrations));
    // (pickIllustrationLines skips the last entry, so append a sentinel to keep every remaining line eligible)
    const picks = pickIllustrationLines([...remaining.map((i) => kinds[i]), undefined], job.autoIllustrations ?? 0).map((k) => remaining[k]!);
    if (picks.length) Object.assign(illustrations, await planIllustrations({ storyId: job.storyId, title: job.script.title, lines: picks.map((i) => ({ index: i, text: timed[i]!.text })) }));
    if (Object.keys(illustrations).length) { job.illustrations = illustrations; job.imageCredits = credits; }
  }
  const scenes: Scene[] = job.style === "tv" ? tvScenes(job, timed) : explainerScenes(job, timed);
  const beats = scenes.map((s) => s.beat?.kind).filter((k): k is BeatKind => Boolean(k));
  const videos: MediaResult["videos"] = [];
  for (const aspect of job.aspects ?? (["9:16"] as Aspect[])) {
    const name = aspect === "9:16" ? "video-916" : "video-169";
    const r = await renderVideo({ outDir: dir, name, scenes, brand, aspect, hls: aspect === "9:16", audioPath: job.silent ? undefined : audioPath, hook });
    videos.push({ aspect, mp4: r.mp4, hls: r.hlsPlaylist, thumbnail: r.thumbnail, durationSeconds: r.durationSeconds });
  }

  // Soft subtitle tracks inside each MP4 (selectable in QuickTime/VLC; platforms use the .vtt files).
  if (captionTracks.length > 0) {
    for (const v of videos) {
      const tmp = `${v.mp4}.sub.mp4`;
      const args = ["-y", "-i", v.mp4, ...captionTracks.flatMap((c) => ["-i", c.path]), "-map", "0:v", "-map", "0:a"];
      captionTracks.forEach((_, i) => args.push("-map", String(i + 1)));
      args.push("-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text");
      captionTracks.forEach((c, i) => args.push(`-metadata:s:s:${i}`, `language=${ISO3[c.lang] ?? "und"}`, `-metadata:s:s:${i}`, `title=${isLang(c.lang) ? LANGUAGES[c.lang].name : c.lang}`));
      args.push("-movflags", "+faststart", tmp);
      try {
        await run("ffmpeg", args);
        await rename(tmp, v.mp4);
      } catch (e) {
        console.warn(`subtitle embed skipped for ${v.mp4}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
  }

  return {
    audio: { path: audioPath, durationSeconds: total, transcript: job.script.lines.map((l) => l.text).join("\n") },
    captionsVtt,
    captionTracks,
    videos,
    beats,
  };
}

type TimedLine = { text: string; label: string; claimIds: string[]; seconds: number };

const outletsFor = (job: MediaJob, claimIds: string[]) => [...new Set(claimIds.flatMap((id) => job.sourceLabels?.[id] ?? []))];

/** Older TV look: anchor opens and closes; split-screen evidence cards in between. */
function tvScenes(job: MediaJob, timed: TimedLine[]): Scene[] {
  return timed.map((t, i) => ({
    label: t.label, text: t.text, claimIds: t.claimIds, seconds: t.seconds,
    sources: outletsFor(job, t.claimIds).slice(0, 2),
    layout: (i === 0 || i === timed.length - 1 || i % 2 === 0 ? "anchor" : "split") as Scene["layout"],
  }));
}

/** Minimum time the end card stays up. */
const END_CARD_SECONDS = 2;

/** Social explainer: one deterministic beat per line (see beats.ts), plus an end card. */
export function explainerScenes(job: MediaJob, timed: TimedLine[]): Scene[] {
  const ctaUrl = job.ctaUrl ?? (process.env.OPENLENS_PUBLIC_URL?.trim() || undefined);
  let prev: BeatKind | undefined;
  const used: BeatKind[] = [];
  const scenes: Scene[] = timed.map((t, i) => {
    const sources = outletsFor(job, t.claimIds);
    const imagePath = job.illustrations?.[i];
    const beat: Beat = pickBeat(
      { label: t.label, text: t.text, claimIds: t.claimIds },
      { claims: job.claims, sources, timeline: job.timeline, timelineLang: job.ledgerLang ?? "en", lang: job.lang,
        index: i, total: timed.length, prev, used, ctaUrl, illustration: Boolean(imagePath) },
      job.beatHints?.[i],
    );
    prev = beat.kind;
    used.push(beat.kind);
    return { label: t.label, text: t.text, claimIds: t.claimIds, seconds: t.seconds, sources, beat, layout: "beat",
      ...(beat.kind === "illustration" ? { imagePath, credit: job.imageCredits?.[i] } : {}) };
  });
  const last = scenes.at(-1)!;
  if (last.beat?.kind === "cta") last.seconds = Math.max(last.seconds, END_CARD_SECONDS);
  else {
    // No spoken call to action: append a silent end card.
    const ui = uiStrings(job.lang);
    const cta = ui.openResearch.charAt(0).toUpperCase() + ui.openResearch.slice(1);
    scenes.push({ text: "", claimIds: [], seconds: END_CARD_SECONDS, layout: "beat", beat: { kind: "cta", text: cta, url: ctaUrl } });
  }
  return scenes;
}
