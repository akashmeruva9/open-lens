// Gemini listening review for generated audio/video: blind transcript, pronunciation checks and a verdict, as JSON.
// Used for the Veo hook clip, TTS respellings and the final mix. Every call is logged by genspend.ts (~US$0.01 each).
//
//   (from services/media-worker) node --env-file-if-exists=../../.env --import tsx src/review.ts <file.mp4|wav|m4a> ["<expected text>"] [--words Treasurer,Chalmers]
import { GoogleGenAI } from "@google/genai";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertBudget, logSpend } from "./genspend.js";

export const REVIEW_MODEL = process.env.MODEL_REVIEW ?? "gemini-3.8-flash";

/** One JSON-mode Gemini call (location global), logged as ~US$0.01. */
export async function askGeminiJson(parts: object[], what: string, usd = 0.01): Promise<unknown> {
  await assertBudget(usd, what);
  const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.REVIEW_LOCATION ?? "global" });
  const r = await ai.models.generateContent({
    model: REVIEW_MODEL,
    contents: [{ role: "user", parts }] as never,
    config: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const u = r.usageMetadata;
  await logSpend({ kind: "review", model: REVIEW_MODEL, usd, note: `${what} in=${u?.promptTokenCount} out=${u?.candidatesTokenCount}` });
  try {
    return JSON.parse(r.text ?? "");
  } catch {
    return r.text;
  }
}

/** Audio track of any media file as 16 kHz mono WAV (small enough to inline). */
export async function audioOf(path: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ol-review-"));
  const wav = join(dir, "a.wav");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", "16000", wav]);
  return readFile(wav);
}

/** Listen to a narration/mix: blind transcript, word errors vs `expected`, how each of `words` was pronounced. */
export async function reviewAudio(path: string, opts: { expected?: string; words?: string[]; what?: string } = {}) {
  const wav = await audioOf(path);
  const words = opts.words ?? [];
  const prompt = `You are a broadcast audio QA reviewer. Listen to this news narration audio and return JSON with keys:
transcript (exact words you hear, blind), ${opts.expected ? "word_errors (list of differences vs the intended text below, including how numbers were said), " : ""}
pronunciation (array of {word, heard_as, correct, timestamp_s} for each of these words: ${words.length ? words.map((w) => `"${w}"`).join(", ") : "none"}; be strict: "Treasurer" must have three syllables TREZH-er-er, not "treasure"),
voices (how many distinct voices, and where the voice changes, with timestamps), audio_artifacts (clipping, cut-off words, long silences, noise, music),
intelligibility_1to5, naturalness_1to5, verdict (one candid paragraph).${opts.expected ? `\nIntended text:\n${opts.expected}` : ""}`;
  return askGeminiJson([{ text: prompt }, { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } }], opts.what ?? `audio review ${path.split("/").pop()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wi = args.indexOf("--words");
  const words = wi >= 0 ? args[wi + 1]!.split(",") : [];
  const pos = args.filter((a, i) => !a.startsWith("--") && (wi < 0 || i !== wi + 1));
  if (!pos[0]) {
    console.error('usage: review.ts <media file> ["<expected text>"] [--words a,b]');
    process.exit(1);
  }
  console.log(JSON.stringify(await reviewAudio(pos[0], { expected: pos[1], words }), null, 2));
}
