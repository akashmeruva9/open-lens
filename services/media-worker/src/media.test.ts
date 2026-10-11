import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderScriptMedia, toVtt } from "./media.js";
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
