// Generate a short "idle" clip (blinking, small head movement, silent) from a presenter portrait with Veo 3.1 Lite.
//   GOOGLE_CLOUD_LOCATION=us-central1 node --env-file-if-exists=../../.env --import tsx src/idleclip.ts <presenterId> [--force]
// One 8s 720p video-only clip: ~US$0.24 at Veo 3.1 Lite video-only 720p ($0.03/s, Vertex pricing page). Cached: never re-billed unless --force.
import { GoogleGenAI } from "@google/genai";
import { PRESENTERS, type PresenterId } from "@openlens/config";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../../..", import.meta.url).pathname;
const MODEL = process.env.MODEL_VIDEO ?? "veo-3.1-lite-generate-001";
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) as PresenterId | undefined;
if (!id || !PRESENTERS[id]) throw new Error(`usage: idleclip.ts <presenterId>  (one of ${Object.keys(PRESENTERS).join(", ")})`);

const outDir = `${ROOT}data/presenters`;
const outFile = `${outDir}/${id}.idle.mp4`;
if (!args.includes("--force") && (await access(outFile).then(() => true, () => false))) {
  console.log(`exists ${outFile} (use --force to regenerate)`);
  process.exit(0);
}

const PROMPT =
  "The same news presenter, seated at the studio desk, looking at the camera and listening calmly. Natural, subtle motion only: occasional blinking, a very slight head nod and tiny shoulder movement, a faint natural smile. " +
  "No talking, no big gestures, camera locked off and perfectly steady, same lighting, same background, same face and clothing throughout. Photorealistic broadcast quality.";

const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.VEO_LOCATION ?? "us-central1" });
const image = { imageBytes: (await readFile(`${outDir}/${id}.png`)).toString("base64"), mimeType: "image/png" };

let video: { videoBytes?: string } | undefined;
const t0 = Date.now();
for (let attempt = 1; attempt <= 3 && !video; attempt++) {
  console.log(`submitting ${MODEL} for ${id} (8s, 720p, no audio), attempt ${attempt}...`);
  let op = await ai.models.generateVideos({
    model: MODEL,
    prompt: PROMPT,
    image,
    config: { numberOfVideos: 1, durationSeconds: 8, aspectRatio: "9:16", resolution: "720p", generateAudio: false } as never,
  });
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10_000));
    op = await ai.operations.getVideosOperation({ operation: op });
  }
  if (op.error) {
    console.log(`  Veo error: ${JSON.stringify(op.error).slice(0, 200)}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 45_000));
    continue;
  }
  video = op.response?.generatedVideos?.[0]?.video;
}
if (!video?.videoBytes) throw new Error("Veo returned no video after 3 attempts");
await mkdir(outDir, { recursive: true });
await writeFile(outFile, Buffer.from(video.videoBytes, "base64"));
console.log(`saved ${outFile} in ${Math.round((Date.now() - t0) / 1000)}s`);
