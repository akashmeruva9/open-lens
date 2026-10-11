import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderVideo } from "./render.js";

test("renders a 9:16 mp4 and HLS playlist from scenes", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "ol-render-"));
  const r = await renderVideo({
    outDir, name: "t", hls: true,
    brand: { title: "t", disclosure: "AI-generated presenter", fontFamily: "sans-serif" },
    scenes: [
      { text: "Scene one", seconds: 1, claimIds: ["c1"] },
      { text: "Scene two", seconds: 1, claimIds: [] },
    ],
  });
  assert.equal(r.durationSeconds, 2);
  assert.ok((await stat(r.mp4)).size > 1000);
  assert.ok((await stat(r.hlsPlaylist!)).size > 0);
});
