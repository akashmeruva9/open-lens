import assert from "node:assert/strict";
import test from "node:test";
import { buildRenderedAssets } from "./handoff.js";

const base = { storyId: "s1", ledgerVersion: 2, status: "draft", aiDisclosure: true, dependsOn: [], channel: "app", createdAt: "t", updatedAt: "t" };
test("video outputs become RenderedAssets with title, presenter and claim ids", () => {
  const rec = {
    outputs: [
      { ...base, id: "script-te", kind: "script", lang: "te", tier: "regional", claimIds: ["c1"], payload: { title: "T", presenter: "priya-te", lines: [] } },
      { ...base, id: "video-te-916", kind: "video", lang: "te", tier: "regional", claimIds: ["c1", "c2"],
        payload: { aspect: "9:16", mp4Url: "/assets/a.mp4", captionsVttUrl: "/assets/a.vtt", durationSeconds: 60, scriptOutputId: "script-te" } },
      { ...base, id: "audio-te", kind: "audio", lang: "te", claimIds: [], payload: {} },
    ],
  } as never;
  const a = buildRenderedAssets(rec);
  assert.equal(a.length, 1);
  assert.deepEqual([a[0]!.lang, a[0]!.aspect, a[0]!.title, a[0]!.presenter, a[0]!.claimIds], ["te", "9:16", "T", "priya-te", ["c1", "c2"]]);
  assert.equal(a[0]!.aiDisclosure, true);
});
