import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { StoryBundle } from "@openlens/schemas";
import { applyClaimPatch, impactedOutputs } from "./corrections.js";
import type { StoryRecord } from "./store.js";

const fixture = JSON.parse(readFileSync(new URL("../../../data/fixtures/story-bundle.json", import.meta.url), "utf8")) as StoryBundle;
const rec = (): StoryRecord => ({ ...structuredClone(fixture), qaFlags: [], runs: [], grounded: false, claimsDropped: 0 });

test("impact follows claimIds and dependsOn transitively", () => {
  const ids = impactedOutputs(rec().outputs, ["c8"]);
  // script-en cites c8 -> video-en-916 depends on script-en -> ig-en depends on the video
  assert.ok(ids.includes("script-en"));
  assert.ok(ids.includes("video-en-916"));
  assert.ok(ids.includes("ig-en"));
  assert.ok(!ids.includes("wa-te"), "Telugu digest does not use c8");
});

test("claim patch bumps version, marks impacted outputs, flags live publications", () => {
  const r = rec();
  r.publications = [{ id: "p1", storyId: r.story.id, outputId: "ig-en", channel: "instagram", ledgerVersion: 1, mode: "live", status: "published", publishedAt: "", approvedBy: "e" }];
  const { rec: next, event, claim } = applyClaimPatch(r, "c8", { state: "contested", reason: "Report figure disputed" }, "editor@x");
  assert.equal(next.story.version, 2);
  assert.equal(next.story.status, "stale");
  assert.equal(claim.state, "contested");
  assert.equal(next.outputs.find((o) => o.id === "video-en-916")!.status, "needs_review");
  assert.equal(next.outputs.find((o) => o.id === "wa-te")!.status, "draft");
  assert.deepEqual(event.impactedPublicationIds, ["p1"]);
  assert.equal(next.publications[0]!.status, "needs_correction");
});

test("reason is mandatory", () => {
  assert.throws(() => applyClaimPatch(rec(), "c1", { state: "supported", reason: " " }, "e"), /reason/);
});
