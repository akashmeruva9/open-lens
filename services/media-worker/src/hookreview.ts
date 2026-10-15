// Review a Veo hook clip with Gemini: transcript, intelligibility, naturalness, lip-sync plausibility, face consistency,
// and how Veo's voice compares with the presenter's Gemini TTS voice reading the same line. Also builds and reviews a
// "muted Veo + TTS overlay" variant so both options can be judged.
//
//   (from services/media-worker) node --env-file-if-exists=../../.env --import tsx src/hookreview.ts <hook.mp4> <presenterId> "<line>"
//
// Cost: Gemini 3.8 Flash review calls (~US$0.01 each, two calls) + one cached TTS line (~US$0.005). Logged.
import { GoogleGenAI } from "@google/genai";
import { type PresenterId } from "@openlens/config";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { assertBudget, exists, logSpend } from "./genspend.js";
import { synthesize, wavDuration } from "./tts.js";

const REVIEW_MODEL = process.env.MODEL_REVIEW ?? "gemini-3.8-flash";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

const ai = () => new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION ?? "global" });

async function ask(parts: object[], what: string): Promise<string> {
  await assertBudget(0.01, what);
  const r = await ai().models.generateContent({ model: REVIEW_MODEL, contents: [{ role: "user", parts }] as never, config: { responseMimeType: "application/json", temperature: 0.2 } });
  const u = r.usageMetadata;
  // Conservative estimate; review calls are a few thousand tokens.
  await logSpend({ kind: "review", model: REVIEW_MODEL, usd: 0.01, note: `${what} in=${u?.promptTokenCount} out=${u?.candidatesTokenCount}` });
  return r.text ?? "";
}

export async function reviewHookClip(mp4: string, presenterId: PresenterId, line: string) {
  const wav = mp4.replace(/\.mp4$/, ".wav");
  const silent = mp4.replace(/\.mp4$/, ".silent.mp4");
  if (!(await exists(wav))) ff(["-i", mp4, "-vn", "-ac", "1", "-ar", "48000", wav]);
  if (!(await exists(silent))) ff(["-i", mp4, "-an", "-c:v", "copy", silent]);

  // Presenter's own TTS voice reading the same line (cached by tts.ts).
  const ttsWav = await synthesize(line, presenterId);
  const ttsFile = mp4.replace(/\.mp4$/, ".tts.wav");
  await writeFile(ttsFile, ttsWav);
  await logSpend({ kind: "tts", model: process.env.MODEL_TTS ?? "tts", usd: 0.005, note: `reference line ${presenterId} (0 if it was a cache hit)` });

  const b64 = async (p: string) => (await readFile(p)).toString("base64");
  const review = await ask(
    [
      { text: `Part 1 is an AI-generated 8-second news-presenter video (with its own generated speech). Part 2 is that clip's audio track alone. Part 3 is a separate text-to-speech voice that our pipeline normally uses for this presenter, reading the same line.
The intended line is: "${line}"
Be candid and specific, like a broadcast QA reviewer. Return JSON with keys:
transcript (exact words heard in part 2), language_heard, word_errors (list of differences vs the intended line, incl. how the number was said),
intelligibility_1to5, naturalness_1to5 (prosody, does it sound like a real news presenter or robotic/odd), audio_artifacts (music, noise, clipping, cut-off words, other voices),
speech_start_s, speech_end_s (approx), lipsync_1to5 (does the mouth shape plausibly match each syllable; note any moments of mismatch with timestamps),
face_consistency_1to5 (identity, hair, clothing stable; any morphing), visual_artifacts (teeth, eyes, hands, text, watermark-like marks),
veo_voice_character (pitch, timbre, accent, pace, wpm estimate), tts_voice_character (same for part 3),
voices_clash (would cutting from the part-2 voice to the part-3 voice in the same video sound like two different people? explain),
verdict (one paragraph: usable as a broadcast opening line or not, and why).` },
      { inlineData: { mimeType: "video/mp4", data: await b64(mp4) } },
      { inlineData: { mimeType: "audio/wav", data: await b64(wav) } },
      { inlineData: { mimeType: "audio/wav", data: await b64(ttsFile) } },
    ],
    "hook review",
  );

  // Variant: Veo picture muted, presenter TTS overlaid from the moment Veo's speech starts.
  let start = 0;
  try { start = Math.max(0, Number(JSON.parse(review).speech_start_s) || 0); } catch { /* keep 0 */ }
  const overlay = mp4.replace(/\.mp4$/, ".ttsoverlay.mp4");
  ff(["-i", silent, "-i", ttsFile, "-filter_complex", `[1:a]adelay=${Math.round(start * 1000)}:all=1,apad[a]`, "-map", "0:v", "-map", "[a]", "-t", "8", "-c:v", "copy", "-c:a", "aac", overlay]);
  const overlayReview = await ask(
    [
      { text: `This 8-second clip shows an AI-generated news presenter whose mouth movements were generated for a DIFFERENT audio track; the audio you hear was overlaid afterwards. Rate candidly as JSON: lipsync_1to5, mismatch_moments (timestamps), audio_extends_past_video (true/false), would_viewers_notice (explain), verdict.` },
      { inlineData: { mimeType: "video/mp4", data: await b64(overlay) } },
    ],
    "tts overlay review",
  );
  const result = { mp4, ttsSeconds: wavDuration(ttsWav), review: safeJson(review), overlayFile: overlay, overlayReview: safeJson(overlayReview) };
  await writeFile(mp4.replace(/\.mp4$/, ".review.json"), JSON.stringify(result, null, 2));
  return result;
}

const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return s; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mp4, presenterId, line] = process.argv.slice(2);
  if (!mp4 || !presenterId || !line) { console.error('usage: hookreview.ts <hook.mp4> <presenterId> "<line>"'); process.exit(1); }
  console.log(JSON.stringify(await reviewHookClip(mp4, presenterId as PresenterId, line), null, 2));
}
