import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoryBundle } from "@openlens/schemas";
import { LocalAssets } from "./assets.js";
import { createApp, toFeedItem, toReaderBundle } from "./app.js";
import { FileStore } from "./store.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "ol-api-"));
  const store = new FileStore(dir);
  const fixture = JSON.parse(await readFile(new URL("./testdata/story-bundle.json", import.meta.url), "utf8")) as StoryBundle;
  await store.put({ ...fixture, qaFlags: [], runs: [], grounded: false, claimsDropped: 0 });
  const app = createApp({ store, assets: new LocalAssets(join(dir, "assets")), workDir: join(dir, "work") });
  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { "content-type": "application/json", "x-dev-user": "editor@test" }, body: body ? JSON.stringify(body) : undefined });
  return { req, store, id: fixture.story.id };
}

test("routes answer with and without the /api prefix", async () => {
  const { req, id } = await setup();
  assert.equal((await req("GET", "/api/health")).status, 200);
  assert.equal((await req("GET", `/api/v1/stories/${id}`)).status, 200);
  assert.equal((await req("GET", "/v1/feed")).status, 200);
  assert.equal((await req("GET", "/apiary")).status, 404);
});

test("reader feed + story hide drafts and ops data", async () => {
  const { req, id } = await setup();
  const feed = await (await req("GET", "/v1/feed")).json();
  assert.equal(feed.length, 1);
  assert.equal(feed[0].sourceCount, 3);
  const b = await (await req("GET", `/v1/stories/${id}`)).json();
  assert.ok(b.outputs.every((o: { status: string; kind: string }) => ["approved", "published"].includes(o.status) && ["script", "video", "audio"].includes(o.kind)));
  assert.equal(b.qaFlags, undefined);
});

test("studio: correction -> needs_review -> approve -> dry-run publish", async () => {
  const { req, id } = await setup();
  const patch = await req("PATCH", `/v1/studio/stories/${id}/claims/c1`, { text: "Metro fares will rise by 18 percent from 1 January.", reason: "Authority corrected figure" });
  assert.equal(patch.status, 200);
  const { correction } = await patch.json();
  assert.ok(correction.impactedOutputIds.includes("fb-en"));

  const fb = await (await req("GET", `/v1/studio/stories/${id}`)).json();
  assert.equal(fb.outputs.find((o: { id: string }) => o.id === "fb-en").status, "needs_review");

  assert.equal((await req("POST", "/v1/studio/outputs/fb-en/publish", { mode: "dry_run" })).status, 409, "must approve first");
  assert.equal((await req("POST", "/v1/studio/outputs/fb-en/approve", {})).status, 200);
  // story is stale after a correction; re-approve it before channel publishing
  assert.equal((await req("POST", `/v1/studio/stories/${id}/approve`, {})).status, 200);
  const pub = await req("POST", "/v1/studio/outputs/fb-en/publish", { mode: "dry_run" });
  assert.ok([200, 422].includes(pub.status), `publish status ${pub.status}`);
  if (pub.status === 200) assert.equal((await pub.json()).mode, "dry_run");

  const evals = await (await req("GET", `/v1/studio/stories/${id}/evals`)).json();
  assert.equal(evals.ledgerVersion, 2);
});

test("subscriber opt-in requires consent", async () => {
  const { req } = await setup();
  assert.equal((await req("POST", "/v1/subscribers", { phone: "+919999999999", lang: "te", region: "IN-TG", topics: [] })).status, 400);
  assert.equal((await req("POST", "/v1/subscribers", { phone: "+919999999999", lang: "te", region: "IN-TG", topics: [], consent: true })).status, 201);
});

test("subscriber can opt out", async () => {
  const { req, store } = await setup();
  await req("POST", "/v1/subscribers", { phone: "+919999999999", lang: "te", region: "IN-TG", topics: [], consent: true });
  assert.equal((await req("DELETE", "/v1/subscribers", { phone: "+919999999999" })).status, 204);
  assert.equal((await store.listSubscribers()).length, 0);
});

test("contesting a claim cited as established blocks approval until resynthesis", async () => {
  const { req, id } = await setup();
  // fixture: established cites c3 and c11 (both supported)
  assert.equal((await req("PATCH", `/v1/studio/stories/${id}/claims/c3`, { state: "contested", reason: "auditor dispute" })).status, 200);
  const res = await req("POST", `/v1/studio/stories/${id}/approve`, {});
  assert.equal(res.status, 409);
  assert.match(JSON.stringify(await res.json()), /unsupported_established/);
});

test("market filter: own market, sub-national, and APAC-wide stories", async () => {
  const { inMarket } = await import("./app.js");
  assert.ok(inMarket("IN-TG", "IN"));
  assert.ok(inMarket("APAC", "JP"));
  assert.ok(!inMarket("JP", "IN"));
  assert.ok(inMarket("JP", "APAC"));
});

test("feed items carry approved video details for cards", async () => {
  const { req } = await setup();
  const [item] = await (await req("GET", "/v1/feed")).json();
  assert.ok(item.videos.length >= 1);
  assert.equal(item.videos[0].aspect, "9:16");
  assert.equal(typeof item.videos[0].durationSeconds, "number");
});

test("legacy local HLS playlists next to a GCS mp4 are served as the GCS sibling", async () => {
  const fixture = JSON.parse(await readFile(new URL("./testdata/story-bundle.json", import.meta.url), "utf8")) as StoryBundle;
  const gcs = "https://storage.googleapis.com/b/s/international-en/v1";
  const rec = { ...fixture, qaFlags: [], runs: [], grounded: false, claimsDropped: 0,
    outputs: fixture.outputs.map((o) => (o.kind === "video" ? { ...o, status: "approved" as const, payload: { ...o.payload, aspect: "9:16", mp4Url: `${gcs}/video-916.mp4`, hlsUrl: "/assets/s/international-en/v1/hls-916/index.m3u8" } } : o)) };
  const item = toFeedItem(rec);
  assert.ok(item.videos?.length);
  for (const v of item.videos!) assert.equal(v.hlsUrl, `${gcs}/hls-916/index.m3u8`);
});

test("readers never get the stored article text of quote-only outlets, only clipped cited passages", async () => {
  const fixture = JSON.parse(await readFile(new URL("./testdata/story-bundle.json", import.meta.url), "utf8")) as StoryBundle;
  const s0 = fixture.sources[0]!;
  const article = `${"Lead paragraph. ".repeat(40)}The board approved a 20 percent fare rise. ${"Background. ".repeat(80)}`;
  const longQuote = "x".repeat(500);
  const rec = {
    ...fixture, qaFlags: [], runs: [], grounded: false, claimsDropped: 0,
    sources: fixture.sources.map((s) => (s.id === s0.id ? { ...s, text: article, rights: { license: "third-party", usage: "link-and-short-quote" } } : s)),
    claims: fixture.claims.map((c, i) => ({ ...c, evidence: [{ sourceId: s0.id, passage: i === 0 ? "The board approved a 20 percent fare rise." : longQuote }] })),
  };
  const b = toReaderBundle(rec);
  const src = b.sources.find((s) => s.id === s0.id)!;
  assert.ok(!src.text.includes("Lead paragraph"), "article text must not be exposed");
  assert.match(src.text, /20 percent fare rise/);
  assert.ok(b.claims.every((c) => c.evidence.every((e) => e.passage.length <= 300)));
  // Open-licence sources keep their full text.
  const other = b.sources.find((s) => s.id !== s0.id);
  if (other) assert.equal(other.text, fixture.sources.find((s) => s.id === other.id)!.text);
});
