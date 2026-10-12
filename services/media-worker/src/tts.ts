import { GoogleGenAI } from "@google/genai";
import { LANGUAGES, MODELS, PRESENTERS, type LangCode, type PresenterId } from "@openlens/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

let ai: GoogleGenAI | undefined;
function client() {
  if (ai) return ai;
  ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.TTS_LOCATION ?? "us-central1" });
  return ai;
}

/** Wrap raw 16-bit little-endian PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Duration of a PCM WAV buffer, reading the fmt and data chunks. */
export function wavDuration(wav: Buffer): number {
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = wav.readUInt32LE(off + 16);
    if (id === "data") return byteRate ? Math.min(size, wav.length - off - 8) / byteRate : 0;
    off += 8 + size + (size % 2);
  }
  return 0;
}

const ACCENT: Partial<Record<LangCode, string>> = {
  en: "neutral international English, the register of a regional news desk",
  hi: "standard Hindi as spoken by a national TV news anchor in Delhi, natural Devanagari pronunciation, English loanwords said the way Hindi speakers say them",
  te: "standard Telugu as spoken by a Hyderabad TV news presenter, natural Telugu pronunciation, English loanwords said the way Telugu speakers say them",
  ja: "standard Tokyo Japanese in the style of an NHK news announcer, correct pitch accent and natural intonation",
};

/** Structured direction: labelled sections plus a transcript marker so the model never reads the notes aloud. */
export function direction(presenter: PresenterId): string {
  const p = PRESENTERS[presenter];
  const lang = LANGUAGES[p.lang].name;
  const accent = ACCENT[p.lang] ?? `standard ${lang} as spoken by a national TV news anchor, natural local pronunciation`;
  return `# AUDIO PROFILE
A professional ${lang} news presenter, ${p.style}.

## DIRECTOR'S NOTES
Style: calm, confident and warm, like a real person telling viewers what happened, not reading from a page. Slight smile in the voice, never robotic or sing-song.
Accent: ${accent}.
Pacing: natural broadcast pace, a short breath between sentences, a slightly longer pause between topics. Do not rush. Do not drag.
Emphasis: lightly stress numbers, dates, names and the key fact of each sentence.
Read the transcript exactly as written. Do not speak these notes. Do not add or skip words.

### TRANSCRIPT
`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CACHE_DIR = () => process.env.TTS_CACHE_DIR ?? resolve(import.meta.dirname, "../../../.data/tts-cache");

/** Synthesize one line with the presenter's voice; returns a WAV buffer. Cached by (model, voice, direction, text),
 *  so re-rendering after a layout change never re-bills narration. */
export async function synthesize(text: string, presenter: PresenterId): Promise<Buffer> {
  const p = PRESENTERS[presenter];
  const key = createHash("sha256").update([MODELS.tts, p.voice, direction(presenter), text].join("\u0000")).digest("hex").slice(0, 32);
  const file = join(CACHE_DIR(), `${key}.wav`);
  const hit = await readFile(file).catch(() => undefined);
  if (hit) return hit;
  const wav = await synthesizeUncached(text, presenter, p);
  await mkdir(CACHE_DIR(), { recursive: true });
  await writeFile(file, wav);
  return wav;
}

async function synthesizeUncached(text: string, presenter: PresenterId, p: (typeof PRESENTERS)[PresenterId]): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await client().models.generateContent({
        model: MODELS.tts,
        contents: direction(presenter) + text,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: p.voice } } },
        },
      });
      const part = r.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData;
      if (!part?.data) throw new Error("TTS returned no audio");
      const buf = Buffer.from(part.data, "base64");
      const mime = part.mimeType ?? "";
      if (buf.toString("ascii", 0, 4) === "RIFF") return buf;
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
      return pcmToWav(buf, rate);
    } catch (err) {
      last = err;
      const status = (err as { status?: number }).status;
      if (status && ![429, 500, 503].includes(status)) throw err;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw last;
}

export async function synthesizeToFile(text: string, presenter: PresenterId, path: string): Promise<number> {
  const wav = await synthesize(text, presenter);
  await writeFile(path, wav);
  return wavDuration(wav);
}
