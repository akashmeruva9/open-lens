import { AI_DISCLOSURE, CHANNEL_PLAN, LANGUAGES, PRESENTERS, isLang, type PresenterId } from "@openlens/config";
import type { ScriptPayload } from "@openlens/schemas";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fontFor, registerDefaultFonts } from "./fonts.js";
import { run, renderVideo } from "./render.js";
import { loadPresenter, type Aspect, type Scene } from "./scenes.js";
import { synthesizeToFile } from "./tts.js";

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
}

export interface MediaResult {
  audio: { path: string; durationSeconds: number; transcript: string };
  captionsVtt: string;
  /** Subtitle tracks (own language first), each timed to this video. */
  captionTracks: { lang: string; path: string }[];
  videos: { aspect: Aspect; mp4: string; hls?: string; thumbnail: string; durationSeconds: number }[];
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

/** Split a scene's text into sentence cues, sharing the scene's time in proportion to text length (readable subtitles). */
export function sentenceCues(text: string, start: number, seconds: number): { text: string; start: number; end: number }[] {
  const parts = [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text)].map((x) => x.segment.trim()).filter(Boolean);
  const sentences = parts.length ? parts : [text];
  const weight = sentences.map((x) => Math.max(8, [...x].length));
  const sum = weight.reduce((a, b) => a + b, 0);
  let t = start;
  return sentences.map((x, i) => {
    const d = (seconds * weight[i]!) / sum;
    const cue = { text: x, start: t, end: i === sentences.length - 1 ? start + seconds : t + d };
    t += d;
    return cue;
  });
}

export function toCuesVtt(texts: string[], seconds: number[]): string {
  let t = 0;
  const cues: string[] = [];
  texts.forEach((text, i) => {
    for (const c of sentenceCues(text, t, seconds[i]!)) cues.push(`${cues.length + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`);
    t += seconds[i]!;
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
  const timed: { text: string; label: string; claimIds: string[]; seconds: number; wav?: string }[] = [];
  for (const [i, l] of job.script.lines.entries()) {
    if (job.silent) {
      timed.push({ ...l, seconds: estimate(l.text) });
    } else {
      const wav = join(dir, `line-${i}.wav`);
      const d = await synthesizeToFile(l.text, presenter, wav);
      timed.push({ ...l, seconds: d + GAP, wav });
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

  // 3) Captions.
  const captionsVtt = join(dir, "captions.vtt");
  const secs = timed.map((t) => t.seconds);
  await writeFile(captionsVtt, toCuesVtt(timed.map((t) => t.text), secs));
  const captionTracks: { lang: string; path: string }[] = [{ lang: job.lang, path: captionsVtt }];
  for (const [lang, texts] of Object.entries(job.captionTracks ?? {})) {
    if (lang === job.lang || texts.length !== timed.length) continue; // only line-aligned scripts
    const path = join(dir, `captions.${lang}.vtt`);
    await writeFile(path, toCuesVtt(texts, secs));
    captionTracks.push({ lang, path });
  }

  // 4) Videos.
  const brand = {
    title: job.script.title,
    disclosure: AI_DISCLOSURE[job.lang] ?? AI_DISCLOSURE.en!,
    fontFamily: fontFor(job.lang),
    lang: job.lang,
    presenterName: persona?.name,
    presenterImage: await loadPresenter(job.presenterImagePath ?? defaultPortrait(presenter)),
    presenterVideo: defaultIdleClip(presenter),
  };
  const scenes: Scene[] = timed.map((t, i) => ({
    label: t.label, text: t.text, claimIds: t.claimIds, seconds: t.seconds,
    sources: [...new Set(t.claimIds.flatMap((id) => job.sourceLabels?.[id] ?? []))].slice(0, 2),
    // TV rhythm: anchor opens and closes; split-screen evidence cards in between.
    layout: (i === 0 || i === timed.length - 1 || i % 2 === 0 ? "anchor" : "split") as Scene["layout"],
  }));
  const videos: MediaResult["videos"] = [];
  for (const aspect of job.aspects ?? (["9:16"] as Aspect[])) {
    const name = aspect === "9:16" ? "video-916" : "video-169";
    const r = await renderVideo({ outDir: dir, name, scenes, brand, aspect, hls: aspect === "9:16", audioPath: job.silent ? undefined : audioPath });
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
  };
}
