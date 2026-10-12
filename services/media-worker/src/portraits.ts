// Generate fictional AI presenter portraits (one per presenter) into data/presenters/.
//   GOOGLE_CLOUD_LOCATION=global node --env-file-if-exists=../../.env --import tsx src/portraits.ts [presenterId ...] [--force]
// Existing files are skipped unless --force, so a re-run never re-bills finished portraits.
import { GoogleGenAI } from "@google/genai";
import { PRESENTERS, type PresenterId } from "@openlens/config";
import { mkdir, writeFile, access } from "node:fs/promises";

const ROOT = new URL("../../..", import.meta.url).pathname;
const OUT = `${ROOT}data/presenters`;
const MODEL = process.env.MODEL_IMAGE ?? "gemini-nano-banana-2.1";

/** Shared studio look: change here and every presenter stays consistent. */
const STUDIO =
  "seated at a modern TV news studio desk, softly blurred background with deep navy and electric-blue ambient light and out-of-focus wall screens (no readable text, no logos), large diffused key light front-right, subtle rim light, shallow depth of field";
const CAMERA = "photorealistic head-and-shoulders portrait, 85mm lens f/2, natural skin texture with visible pores, soft catchlights in the eyes, calm confident broadcast expression with a slight natural smile, looking straight at the camera";
const AVOID = "No text, no watermark, no logos, no on-screen graphics. A fully fictional person, not resembling any real individual or public figure.";

const LOOK: Partial<Record<PresenterId, string>> = {
  "maya-apac": "a woman in her mid-30s with Southeast Asian features, shoulder-length dark hair, tailored charcoal blazer over a soft white top",
  "kavya-hi": "an Indian woman in her early 30s, dark hair in a neat low bun, wearing an elegant deep teal silk saree with a fine gold border draped over the shoulder, small gold stud earrings, a small bindi",
  "priya-te": "a South Indian woman in her late 20s, long dark hair worn in a loose plait over one shoulder, warm friendly look, mustard-and-navy blazer, small jhumka-style earrings",
  "haruka-ja": "a Japanese woman in her late 20s, neat shoulder-length black hair, composed and polite look, navy suit jacket over a crisp white blouse",
};

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION ?? "global" });
const args = process.argv.slice(2);
const force = args.includes("--force");
const ids = (args.filter((a) => !a.startsWith("--")).length ? args.filter((a) => !a.startsWith("--")) : Object.keys(LOOK)) as PresenterId[];

await mkdir(OUT, { recursive: true });
for (const id of ids) {
  const look = LOOK[id];
  if (!look || !PRESENTERS[id]) { console.log(`skip ${id}: no look defined`); continue; }
  const file = `${OUT}/${id}.png`;
  if (!force && (await access(file).then(() => true, () => false))) { console.log(`exists ${id}`); continue; }
  const prompt = `${CAMERA} of ${look}, ${STUDIO}. ${AVOID}`;
  const r = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } } as never,
  });
  const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) { console.log(`FAILED ${id}: ${JSON.stringify(r.candidates?.[0]?.finishReason)}`); continue; }
  await writeFile(file, Buffer.from(part.inlineData.data, "base64"));
  await writeFile(`${OUT}/${id}.prompt.txt`, prompt);
  console.log(`saved ${file}`);
}
