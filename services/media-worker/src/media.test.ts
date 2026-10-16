import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderScriptMedia, toCuesVtt, toVtt } from "./media.js";
import { runCapture } from "./render.js";
import { pcmToWav, wavDuration } from "./tts.js";

test("wav header round-trips duration", () => {
  const wav = pcmToWav(Buffer.alloc(24000 * 2 * 3), 24000);
  assert.equal(wavDuration(wav), 3);
});

test("vtt cues are contiguous", () => {
  const v = toVtt([{ text: "a", seconds: 1.5 }, { text: "b", seconds: 2 }]);
  assert.match(v, /00:00:00.000 --> 00:00:01.500\na/);
  assert.match(v, /00:00:01.500 --> 00:00:03.500\nb/);
});

test("renders 9:16 + 16:9 from a script without TTS", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "ol-media-"));
  const r = await renderScriptMedia({
    key: "national-en", lang: "en", outDir, silent: true, aspects: ["9:16", "16:9"],
    script: { title: "T", presenter: "arjun-en", lines: [
      { label: "WHAT", text: "Fares rise 20 percent.", claimIds: ["c1"] },
      { label: "WHY", text: "Costs went up.", claimIds: ["c2"] },
      { label: "UNKNOWN", text: "Subsidy unclear.", claimIds: [] },
    ] },
  });
  assert.equal(r.videos.length, 2);
  for (const v of r.videos) assert.ok((await stat(v.mp4)).size > 1000);
  assert.ok(r.videos[0]!.hls);
  assert.match(await readFile(r.captionsVtt, "utf8"), /^WEBVTT/);
});

test("renders carousel slides as 4:5 PNGs", async () => {
  const { renderCarouselSlides } = await import("./carousel.js");
  const outDir = await mkdtemp(join(tmpdir(), "ol-car-"));
  const files = await renderCarouselSlides(
    [1, 2, 3].map((i) => ({ heading: `Slide ${i}`, body: "Body text for the slide.", claimIds: ["c1"] })), "te", "T", outDir);
  assert.equal(files.length, 3);
  const png = await readFile(files[0]!);
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
});

test("captions: one cue per spoken line, ending when that line's narration ends", () => {
  const v = toCuesVtt(["The board voted. Fares rise by 20 percent.", "Costs went up."], [4.35, 2.35], [4, 2]);
  const cues = [...v.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\n(.+)/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(cues, [
    ["00:00:00.000", "00:00:04.000", "The board voted. Fares rise by 20 percent."],
    ["00:00:04.350", "00:00:06.350", "Costs went up."],
  ]);
  // A hook intro shifts every line and adds its own cue first.
  const h = toCuesVtt(["Line one."], [3.35], [3], { offset: 5, lead: [{ text: "Hook.", start: 0, end: 5 }] });
  assert.match(h, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:05\.000\nHook\.\n\n2\n00:00:05\.000 --> 00:00:08\.000\nLine one\.\n$/);
});

const probeDuration = async (f: string) =>
  Number((await runCapture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])).stdout.trim());

test("explainer: picks beats from claims, appends an end card, and prepends an optional hook clip", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { writeFile } = await import("node:fs/promises");
  const { run } = await import("./render.js");
  const outDir = await mkdtemp(join(tmpdir(), "ol-explainer-"));
  const img = createCanvas(640, 360);
  const g = img.getContext("2d");
  g.fillStyle = "#3a6";
  g.fillRect(0, 0, 640, 360);
  const imgPath = join(outDir, "ill.png");
  await writeFile(imgPath, img.toBuffer("image/png"));
  const hookPath = join(outDir, "hook.mp4");
  await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=s=720x1280:r=30:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", hookPath]);
  const r = await renderScriptMedia({
    key: "national-en", lang: "en", outDir, silent: true, aspects: ["9:16"],
    claims: { c1: { text: "Fares rise by 20 percent.", state: "supported" }, c2: { text: "Costs rose 35 percent.", state: "unverified" } },
    sourceLabels: { c1: ["Gazette", "Daily"] },
    illustrations: { 1: imgPath },
    hookClipPath: hookPath, hookSeconds: 2, hookText: "Metro fares are going up.",
    script: { title: "T", presenter: "maya-apac", lines: [
      { label: "WHAT", text: "Fares rise 20 percent.", claimIds: ["c1"] },
      { label: "WHY", text: "Costs went up 35 percent.", claimIds: ["c2"] },
      { label: "UNKNOWN", text: "Subsidy unclear, and costs rose 35 percent.", claimIds: ["c2"] },
    ] },
  });
  // c2 is unverified: no number card for 35; no spoken CTA, so a silent end card is appended.
  assert.deepEqual(r.beats, ["number", "illustration", "hero", "cta"]);
  const v = r.videos[0]!;
  const lines = r.audio.durationSeconds;
  assert.ok(Math.abs(v.durationSeconds - (2 + lines + 2)) < 0.01, `duration ${v.durationSeconds}`);
  assert.ok(Math.abs((await probeDuration(v.mp4)) - v.durationSeconds) < 0.25);
  const vtt = await readFile(r.captionsVtt, "utf8");
  assert.match(vtt, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:02\.000\nMetro fares are going up\./);
  assert.match(vtt, /2\n00:00:02\.000 --> /);
});
