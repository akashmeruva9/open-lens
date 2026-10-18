import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoryBundle } from "@openlens/schemas";
import { LocalAssets } from "./assets.js";
import { FileStore } from "./store.js";
import { autoSocial, dailyCaps, postStory } from "./social.js";

async function setup(over: Partial<StoryBundle["story"]> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ol-social-"));
  const store = new FileStore(dir);
  const fixture = JSON.parse(await readFile(new URL("./testdata/story-bundle.json", import.meta.url), "utf8")) as StoryBundle;
  fixture.story = { ...fixture.story, ...over };
  await store.put({ ...fixture, qaFlags: [], runs: [], grounded: false, claimsDropped: 0 });
  return { deps: { store, assets: new LocalAssets(join(dir, "assets")) }, id: fixture.story.id, store };
}
const withEnv = async (vars: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try { await fn(); } finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
};

test("autoSocial does nothing unless AUTO_SOCIAL is 1 or dry", async () => {
  const { deps, id } = await setup();
  await withEnv({ AUTO_SOCIAL: undefined }, async () => assert.deepEqual(await autoSocial(deps, id), []));
  await withEnv({ AUTO_SOCIAL: "0" }, async () => assert.deepEqual(await autoSocial(deps, id), []));
});

test("autoSocial leaves sensitive, unpublished and flagged stories to a person", async () => {
  for (const over of [{ riskTier: "sensitive" as const }, { status: "in_review" as const }, { checksFlagged: true }]) {
    const { deps, id } = await setup(over);
    await withEnv({ AUTO_SOCIAL: "dry" }, async () => assert.deepEqual(await autoSocial(deps, id), [], JSON.stringify(over)));
  }
});

test("autoSocial dry run touches nothing and never publishes", async () => {
  const { deps, id, store } = await setup();
  await withEnv({ AUTO_SOCIAL: "dry" }, async () => {
    const rows = await autoSocial(deps, id);
    assert.ok(rows.length >= 3, "one row per channel and language");
    assert.ok(rows.every((r) => r.outcome !== "published"));
  });
  const rec = (await store.get(id))!;
  assert.equal(rec.publications.length, 0);
  assert.ok(!rec.outputs.some((o) => o.status === "published" && o.channel !== "app"));
});

test("live posting stops at the daily cap before any request is made", async () => {
  const { deps, id } = await setup();
  const rows = await postStory({ ...deps, storyId: id, live: true, approve: true, allow: () => false });
  assert.ok(rows.length >= 3);
  assert.ok(rows.every((r) => r.outcome === "skipped"), JSON.stringify(rows.map((r) => [r.channel, r.lang, r.outcome, r.detail])));
});

test("daily caps default to what the platforms and a new account can take, and can be set", () => {
  assert.deepEqual(dailyCaps({}), { youtube: 4, instagram: 8, facebook: 8 });
  assert.deepEqual(dailyCaps({ AUTO_SOCIAL_YT_PER_DAY: "2", AUTO_SOCIAL_IG_PER_DAY: "3", AUTO_SOCIAL_FB_PER_DAY: "1" }), { youtube: 2, instagram: 3, facebook: 1 });
});
