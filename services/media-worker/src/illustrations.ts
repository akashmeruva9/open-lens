// Editorial illustrations for news beats with Nano Banana 2.1 (Vertex AI, location global).
// Abstract flat/isometric editorial style only: no real people, no photoreal "footage", no documents, no text in the image
// (we overlay text ourselves). Cached by hash of (model, final prompt, aspect) under .data/illustrations/<storyId>/.
//
//   (from services/media-worker) node --env-file-if-exists=../../.env --import tsx src/illustrations.ts <storyId> "<subject>" [--aspect 9:16|16:9] [--dry] [--force]
//
// Cost: ~US$0.035 per 1K image (1120 output tokens at US$30/M). Logged to .data/genai-spend.jsonl, capped by GENAI_SPEND_CAP_USD.
import { GoogleGenAI } from "@google/genai";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR, PRICE, assertBudget, exists, logSpend, sha } from "./genspend.js";

export const ILLUSTRATION_MODEL = process.env.MODEL_IMAGE ?? "gemini-nano-banana-2.1";

/** One house style for every story, so beats cut together. Change it here, not per call. */
export const ILLUSTRATION_STYLE =
  "Flat vector editorial illustration in the style of a quality financial newspaper's explainer graphics: clean geometric shapes, " +
  "subtle isometric perspective, soft grain texture, limited palette of deep navy (#0B1F3A), slate blue, warm off-white and one accent " +
  "colour of amber (#F2A33A), gentle soft shadows, generous negative space, calm and serious tone, high production quality";

/** Non-negotiable rules appended to every prompt. */
export const ILLUSTRATION_RULES =
  "Strictly no text, letters, numbers, digits, currency symbols, labels, logos, flags, watermarks or signatures anywhere in the image. " +
  "No real people and no recognisable person; if people are needed, use small faceless stylised figures only. " +
  "Not photorealistic, not a photograph, no news footage, no documents, screenshots, banknotes or official seals. " +
  "Abstract and symbolic, suitable as a neutral background behind news captions.";

/** Realistic look: generic objects and places only. It must never pass for documentary footage of a real event. */
export const PHOTO_STYLE =
  "Photorealistic, high-quality documentary-style photograph with natural light, realistic materials and depth of field, " +
  "shot on a full-frame camera, muted natural colour grade, calm and serious editorial tone";
export const PHOTO_RULES =
  "Strictly no text, letters, numbers, digits, logos, flags, uniforms, insignia, watermarks or signatures anywhere in the image. " +
  "No people: no faces, no recognisable person, no crowds; show only objects, equipment, landscapes or empty places. " +
  "Generic and plausible, not a depiction of a specific real event, place or incident. No documents, screenshots, banknotes or official seals. " +
  "Suitable as a neutral background behind news captions.";

const COMPOSITION: Record<"9:16" | "16:9", string> = {
  "9:16": "Vertical composition: main subject centred in the middle of the frame with plenty of empty space above and below it; one continuous seamless background gradient filling the whole frame edge to edge, with no bands, stripes, panels, frames or borders.",
  "16:9": "Wide composition: main subject in the right two-thirds with empty space on the left; one continuous seamless background gradient filling the whole frame edge to edge, with no bands, stripes, panels, frames or borders.",
};

/** Recommended template: `subject` is ONE visual metaphor, described as objects/shapes, never as a headline. */
export function illustrationPrompt(subject: string, aspect: "9:16" | "16:9", look: "editorial" | "photo" = "editorial"): string {
  const [style, rules] = look === "photo" ? [PHOTO_STYLE, PHOTO_RULES] : [ILLUSTRATION_STYLE, ILLUSTRATION_RULES];
  const composition = look === "photo" ? COMPOSITION[aspect].replace(/one continuous seamless background gradient filling the whole frame edge to edge, with no bands, stripes, panels, frames or borders\./, "natural full-frame scene with no borders, frames or panels.") : COMPOSITION[aspect];
  return `${style}. Subject: ${subject.trim().replace(/\.$/, "")}. ${composition} ${rules}`;
}

export interface IllustrationOptions {
  /** One visual metaphor for the beat, e.g. "an upward-stepping staircase of abstract bar shapes beside a stylised central bank building". */
  prompt: string;
  aspect?: "9:16" | "16:9";
  storyId: string;
  /** Optional slug for a readable file name. */
  name?: string;
  force?: boolean;
  dryRun?: boolean;
  /** "editorial" (default flat vector house style) or "photo" (realistic, generic objects/places only; still labelled AI-generated on screen). */
  look?: "editorial" | "photo";
}

export interface Illustration { file: string; cached: boolean; costUsd: number; prompt: string; key: string; latencyS?: number }

export async function generateIllustration(o: IllustrationOptions): Promise<Illustration> {
  const aspect = o.aspect ?? "9:16";
  const prompt = illustrationPrompt(o.prompt, aspect, o.look ?? "editorial");
  const key = sha(ILLUSTRATION_MODEL, prompt, aspect);
  const slug = (o.name ?? o.prompt).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32).replace(/-+$/, "");
  const dir = resolve(DATA_DIR, "illustrations", o.storyId.replace(/[^\w.-]/g, "_"));
  const file = resolve(dir, `${slug}-${aspect.replace(":", "x")}-${key}.png`);
  if (!o.force && (await exists(file))) return { file, cached: true, costUsd: 0, prompt, key };
  if (o.dryRun) return { file, cached: false, costUsd: PRICE.nanoBanana1K, prompt, key };

  await assertBudget(PRICE.nanoBanana1K, `illustration ${slug}`);
  const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.IMAGE_LOCATION ?? "global" });
  const t0 = Date.now();
  let data: string | undefined;
  for (let attempt = 0; attempt < 4 && !data; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: ILLUSTRATION_MODEL,
        contents: prompt,
        config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect }, labels: { app: "openlens", use: "illustration" } } as never,
      });
      data = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (!data) throw Object.assign(new Error(`no image (finishReason ${r.candidates?.[0]?.finishReason})`), { status: 0 });
    } catch (err) {
      const status = (err as { status?: number }).status;
      console.log(`  ${slug}: attempt ${attempt + 1} failed (${status ?? "?"}): ${String((err as Error).message).slice(0, 160)}`);
      if (status !== 429 && status !== 503 && status !== 500) throw err;
      await new Promise((res) => setTimeout(res, 5000 * 2 ** attempt));
    }
  }
  if (!data) throw new Error("Nano Banana returned no image after retries");
  const latencyS = Math.round((Date.now() - t0) / 1000);
  await mkdir(dir, { recursive: true });
  await writeFile(file, Buffer.from(data, "base64"));
  await writeFile(file.replace(/\.png$/, ".prompt.txt"), prompt);
  await logSpend({ kind: "illustration", model: ILLUSTRATION_MODEL, usd: PRICE.nanoBanana1K, key, latencyS, note: `${o.storyId}/${slug} ${aspect}` });
  return { file, cached: false, costUsd: PRICE.nanoBanana1K, prompt, key, latencyS };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ai = args.indexOf("--aspect");
  const pos = args.filter((a, i) => !a.startsWith("--") && (ai < 0 || i !== ai + 1));
  const [storyId, subject] = pos;
  if (!storyId || !subject) {
    console.error('usage: illustrations.ts <storyId> "<subject>" [--aspect 9:16|16:9] [--photo] [--dry] [--force]');
    process.exit(1);
  }
  const r = await generateIllustration({ storyId, prompt: subject, aspect: (ai >= 0 ? args[ai + 1] : "9:16") as "9:16" | "16:9", dryRun: args.includes("--dry"), force: args.includes("--force"), look: args.includes("--photo") ? "photo" : "editorial" });
  console.log(JSON.stringify(r, null, 2));
}
