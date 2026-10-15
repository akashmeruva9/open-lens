// Voice audition: same real script text, several voices per language, structured direction prompt.
//   GOOGLE_CLOUD_LOCATION=us-central1 node --env-file-if-exists=../../.env --import tsx src/voicetest.ts [storyId] [outDir]
import { GoogleGenAI } from "@google/genai";
import { LANGUAGES, type LangCode } from "@openlens/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pcmToWav, wavDuration } from "./tts.js";

const ROOT = new URL("../../..", import.meta.url).pathname;
const storyId = process.argv[2];
if (!storyId) throw new Error("usage: voicetest.ts <storyId> [outDir]");
const outDir = process.argv[3] ?? `${ROOT}.data/voicetest`;
const MODEL = process.env.VOICETEST_MODEL ?? "gemini-3.1-flash-tts-preview";

const CANDIDATES: Record<string, string[]> = {
  en: ["Aoede", "Kore", "Zephyr", "Sulafat"],
  hi: ["Kore", "Leda", "Zephyr", "Achird"],
  te: ["Leda", "Kore", "Aoede", "Sulafat"],
  ja: ["Charon", "Orus", "Kore", "Fenrir"],
};

const ACCENT: Record<string, string> = {
  en: "neutral international English, the register of a regional news desk",
  hi: "standard Hindi as spoken by a national TV news anchor in Delhi, natural Devanagari pronunciation, English loanwords said the way Hindi speakers say them",
  te: "standard Telugu as spoken by a Hyderabad TV news presenter, natural Telugu pronunciation, English loanwords said the way Telugu speakers say them",
  ja: "standard Tokyo Japanese in the style of an NHK news announcer, correct pitch accent and natural intonation",
};

function direction(lang: string, voiceStyle: string): string {
  return `# AUDIO PROFILE
A professional ${LANGUAGES[lang as LangCode].name} news presenter, ${voiceStyle}.

## DIRECTOR'S NOTES
Style: calm, confident and warm, like a real person telling viewers what happened, not reading from a page. Slight smile in the voice, never robotic or sing-song.
Accent: ${ACCENT[lang]}.
Pacing: natural broadcast pace, a short breath between sentences, a slightly longer pause between topics. Do not rush. Do not drag.
Emphasis: lightly stress numbers, dates, names and the key fact of each sentence.
Read the transcript exactly as written. Do not speak these notes. Do not add or skip words.

### TRANSCRIPT
`;
}

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1" });

async function speak(text: string, voice: string, lang: string, model: string, prompt: string): Promise<Buffer> {
  const r = await ai.models.generateContent({
    model,
    contents: prompt + text,
    config: { responseModalities: ["AUDIO"], speechConfig: { languageCode: undefined, voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } as never },
  });
  const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new Error(`no audio (${lang}/${voice}): ${JSON.stringify(r.candidates?.[0]?.finishReason)}`);
  const buf = Buffer.from(part.data, "base64");
  if (buf.toString("ascii", 0, 4) === "RIFF") return buf;
  return pcmToWav(buf, Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000));
}

const rec = JSON.parse(await readFile(`${ROOT}.data/stories/${storyId}.json`, "utf8"));
await mkdir(outDir, { recursive: true });
const jobs: Array<() => Promise<void>> = [];
for (const lang of Object.keys(CANDIDATES)) {
  const script = rec.outputs.find((o: { kind: string; lang: string }) => o.kind === "script" && o.lang === lang);
  if (!script) { console.log(`no script for ${lang}`); continue; }
  const text = (script.payload.lines as Array<{ text: string }>).slice(0, 2).map((l) => l.text).join(" ");
  await writeFile(`${outDir}/${lang}_text.txt`, text);
  for (const voice of CANDIDATES[lang]!) {
    jobs.push(async () => {
      try {
        const wav = await speak(text, voice, lang, MODEL, direction(lang, "warm and clear"));
        await writeFile(`${outDir}/${lang}_${voice}.wav`, wav);
        console.log(`${lang} ${voice} ${wavDuration(wav).toFixed(1)}s (${MODEL})`);
      } catch (e) { console.log(`${lang} ${voice} FAILED ${(e as Error).message.slice(0, 160)}`); }
    });
  }
  // Old baseline for comparison: 2.5 TTS with the one-line prompt.
  jobs.push(async () => {
    try {
      const wav = await speak(text, CANDIDATES[lang]![0]!, lang, "gemini-2.5-flash-tts", "Read this news line in a warm, clear news presenter voice. Do not add words.\n\n");
      await writeFile(`${outDir}/${lang}_OLD-baseline.wav`, wav);
      console.log(`${lang} OLD-baseline ${wavDuration(wav).toFixed(1)}s`);
    } catch (e) { console.log(`${lang} OLD FAILED ${(e as Error).message.slice(0, 160)}`); }
  });
}
for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map((j) => j()));
console.log(`\nSamples in ${outDir}`);
