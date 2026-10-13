import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderScriptMedia, sentenceCues, toCuesVtt, toVtt } from "./media.js";
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

test("sentenceCues splits a scene into timed sentences that fill the scene", () => {
  const c = sentenceCues("The board voted. Fares rise by 20 percent from January.", 10, 8);
  assert.equal(c.length, 2);
  assert.equal(c[0]!.start, 10);
  assert.equal(c[1]!.end, 18);
  assert.ok(c[0]!.end > 10 && c[0]!.end < 18);
  assert.match(toCuesVtt(["A b. C d."], [4]), /^WEBVTT[\s\S]*1\n[\s\S]*2\n/);
});
