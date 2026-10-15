// Spoken "hook" opening: Veo 3.1 Fast image-to-video from a presenter portrait, speaking ONE short line with
// Veo's own generated voice (Veo cannot lip-sync to supplied audio). Cached by hash of (model, portrait, prompt, options).
//
//   (from services/media-worker) node --env-file-if-exists=../../.env --import tsx src/hook.ts maya-apac en "The Reserve Bank of Australia has raised ..." [--aspect 9:16] [--duration 8] [--dry] [--force]
//
// Cost: Veo 3.1 Fast video+audio 720p = US$0.10/s -> US$0.80 per 8 s clip (US$0.40 at 4 s). Every paid call is logged
// to .data/genai-spend.jsonl and refused beyond GENAI_SPEND_CAP_USD (default 3).
import { GoogleGenAI } from "@google/genai";
import { LANGUAGES, PRESENTERS, type LangCode, type PresenterId } from "@openlens/config";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR, PRICE, REPO_ROOT, assertBudget, exists, logSpend, sha } from "./genspend.js";

export const HOOK_MODEL = process.env.MODEL_VIDEO_HOOK ?? "veo-3.1-fast-generate-001";
const HOOK_DIR = () => resolve(DATA_DIR, "hooks");

export interface HookClipOptions {
  presenterId: PresenterId;
  /** The single spoken sentence (keep it <= ~18 words so it fits in 8 s). */
  line: string;
  lang: LangCode;
  aspect?: "9:16" | "16:9";
  /** Veo 3.1 accepts 4, 6 or 8. */
  durationSeconds?: 4 | 6 | 8;
  force?: boolean;
  /** Return the prompt and cost estimate without calling Veo. */
  dryRun?: boolean;
}

export interface HookClip {
  /** MP4 with Veo's generated speech. */
  file: string;
  /** 48 kHz WAV extracted from the clip (Veo's voice), for keep-or-replace decisions. */
  audioFile: string;
  /** Same clip with the audio track removed (for overlaying our own TTS instead). */
  silentFile: string;
  cached: boolean;
  costUsd: number;
  latencyS?: number;
  prompt: string;
  key: string;
}

const ACCENT: Partial<Record<LangCode, string>> = {
  en: "neutral international English",
  hi: "standard Hindi like a national TV news anchor in Delhi",
};

export function hookPrompt(o: Pick<HookClipOptions, "line" | "lang">): string {
  const lang = LANGUAGES[o.lang].name;
  const accent = ACCENT[o.lang] ?? `standard ${lang}`;
  return (
    `The same TV news presenter from the image, seated at the studio desk, looks straight into the camera and speaks in ${lang} (${accent}) ` +
    `with a calm, confident, warm news-presenter delivery, clear articulation and natural lip movement matching every word. ` +
    `She says: "${o.line.trim()}" ` +
    `Steady locked-off medium close-up, same face, hair, clothing, lighting and blurred studio background as the image throughout. ` +
    `Audio: only her voice in a quiet studio, no music, no sound effects. No subtitles, no captions, no on-screen text.`
  );
}

const NEGATIVE = "subtitles, captions, on-screen text, logos, music, extra people, hand gestures, camera movement, face morphing";

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

/** Centre-crop the 3:4 portrait to 9:16 so Veo does not pad it with black bars. */
async function portraitFor(presenterId: PresenterId, aspect: "9:16" | "16:9"): Promise<Buffer> {
  const src = resolve(REPO_ROOT, "data/presenters", `${presenterId}.png`);
  if (!(await exists(src))) throw new Error(`no portrait for ${presenterId}: ${src} (run npm run portraits first)`);
  if (aspect === "16:9") return readFile(src);
  const out = resolve(HOOK_DIR(), `${presenterId}.916.png`);
  if (!(await exists(out))) {
    await mkdir(HOOK_DIR(), { recursive: true });
    ffmpeg(["-i", src, "-vf", "crop=trunc(ih*9/16/2)*2:ih", out]);
  }
  return readFile(out);
}

export async function generateHookClip(o: HookClipOptions): Promise<HookClip> {
  const aspect = o.aspect ?? "9:16";
  const duration = o.durationSeconds ?? 8;
  if (!PRESENTERS[o.presenterId]) throw new Error(`unknown presenter ${o.presenterId}`);
  const image = await portraitFor(o.presenterId, aspect);
  const prompt = hookPrompt(o);
  const config = { numberOfVideos: 1, durationSeconds: duration, aspectRatio: aspect, resolution: "720p", generateAudio: true, negativePrompt: NEGATIVE, personGeneration: "allow_adult" };
  const key = sha(HOOK_MODEL, image, prompt, JSON.stringify(config));
  const base = resolve(HOOK_DIR(), `${o.presenterId}-${o.lang}-${key}`);
  const out: HookClip = { file: `${base}.mp4`, audioFile: `${base}.wav`, silentFile: `${base}.silent.mp4`, cached: true, costUsd: 0, prompt, key };
  const cost = PRICE.veoFastAudio720 * duration;

  if (!o.force && (await exists(out.file))) return finish(out);
  if (o.dryRun) return { ...out, cached: false, costUsd: cost };

  await assertBudget(cost, `Veo hook ${o.presenterId}/${o.lang}`);
  const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.VEO_LOCATION ?? "us-central1" });
  const t0 = Date.now();
  let video: { videoBytes?: string } | undefined;
  for (let attempt = 1; attempt <= 3 && !video; attempt++) {
    console.log(`submitting ${HOOK_MODEL} (${duration}s ${aspect} 720p, with audio) for ${o.presenterId}/${o.lang}, attempt ${attempt}...`);
    let op = await ai.models.generateVideos({
      model: HOOK_MODEL,
      prompt,
      image: { imageBytes: image.toString("base64"), mimeType: "image/png" },
      config: { ...config, labels: { app: "openlens", use: "hook" } } as never,
    });
    while (!op.done) {
      await new Promise((r) => setTimeout(r, 10_000));
      op = await ai.operations.getVideosOperation({ operation: op });
    }
    if (op.error) {
      console.log(`  Veo error (not billed): ${JSON.stringify(op.error).slice(0, 300)}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 45_000));
      continue;
    }
    const resp = op.response;
    if (resp?.raiMediaFilteredCount) console.log(`  RAI filtered: ${JSON.stringify(resp.raiMediaFilteredReasons)}`);
    video = resp?.generatedVideos?.[0]?.video;
    if (!video?.videoBytes) break;
  }
  if (!video?.videoBytes) throw new Error("Veo returned no video");
  out.latencyS = Math.round((Date.now() - t0) / 1000);
  out.costUsd = cost;
  out.cached = false;
  await mkdir(HOOK_DIR(), { recursive: true });
  await writeFile(out.file, Buffer.from(video.videoBytes, "base64"));
  await writeFile(`${base}.json`, JSON.stringify({ model: HOOK_MODEL, presenterId: o.presenterId, lang: o.lang, line: o.line, prompt, config, costUsd: cost, latencyS: out.latencyS, createdAt: new Date().toISOString() }, null, 2));
  await logSpend({ kind: "veo-hook", model: HOOK_MODEL, usd: cost, key, latencyS: out.latencyS, note: `${o.presenterId}/${o.lang} ${duration}s ${aspect}` });
  return finish(out);
}

async function finish(out: HookClip): Promise<HookClip> {
  if (!(await exists(out.audioFile))) ffmpeg(["-i", out.file, "-vn", "-ac", "1", "-ar", "48000", out.audioFile]);
  if (!(await exists(out.silentFile))) ffmpeg(["-i", out.file, "-an", "-c:v", "copy", out.silentFile]);
  return out;
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const pos = args.filter((a, i) => !a.startsWith("--") && !["--aspect", "--duration"].includes(args[i - 1] ?? ""));
  const [presenterId, lang, line] = pos as [PresenterId, LangCode, string];
  if (!presenterId || !lang || !line) {
    console.error('usage: hook.ts <presenterId> <lang> "<line>" [--aspect 9:16|16:9] [--duration 4|6|8] [--dry] [--force]');
    process.exit(1);
  }
  const r = await generateHookClip({
    presenterId, lang, line,
    aspect: (flag("--aspect") as "9:16" | "16:9") ?? "9:16",
    durationSeconds: Number(flag("--duration") ?? 8) as 4 | 6 | 8,
    dryRun: args.includes("--dry"),
    force: args.includes("--force"),
  });
  console.log(JSON.stringify(r, null, 2));
}
