import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AllowlistEntry, Lead } from "@openlens/agents";
import type { SourceRecord } from "@openlens/schemas";
import { LocalAssets } from "./assets.js";
import { ingestCycle, type IngestConfig, type IngestEffects } from "./ingest.js";
import { FileStore } from "./store.js";

const allow = (domain: string, publisher: string, sourceType: "primary" | "reporting" = "reporting"): AllowlistEntry => ({
  domain, publisher, market: "JP", sourceType, lens: { rating: "unrated", ratingBasis: "test" }, rights: { license: "test", usage: "test" }, verified: true,
});
const cfg = (over: Partial<IngestConfig> = {}): IngestConfig => ({
  feeds: [], allowlist: [allow("a.jp", "A Shimbun"), allow("b.jp", "B News")], markets: ["JP"], gdelt: true, lookbackMin: 30,
  maxAgeHours: 48, maxFetchPerCycle: 40, maxNewStoriesPerCycle: 3, maxUpdatesPerCycle: 3, dailyRunBudget: 10, maxConcurrentRuns: 1, minPublishers: 2, autoPublish: "off", autoMediaLangs: [], ...over,
});
const lead = (id: string, domain: string, title: string, extra: Partial<Lead> = {}): Lead =>
  ({ id, url: `https://${domain}/${id}`, title, publishedAt: "2026-10-12T00:00:00Z", market: "JP", domain, via: "gdelt", ...extra });

function effects(leads: Lead[], processed: string[]): IngestEffects {
  return {
    discoverFeed: async () => [],
    discoverGdelt: async () => leads,
    embed: async (texts) => texts.map((t) => (t.includes("fare") ? [1, 0] : [0, 1])),
    intake: async (url, storyId, sourceId, list) => {
      const host = new URL(url).hostname;
      const a = list.find((x) => x.domain === host);
      if (!a) return { rejected: "not allowlisted" };
      const s: SourceRecord = { id: sourceId, storyId, url, publisher: a.publisher, title: "t", publishedAt: "2026-10-12T00:00:00Z", language: "ja",
        sourceType: a.sourceType, lens: a.lens, rights: a.rights, text: "x".repeat(300) };
      return { source: s };
    },
    process: async (id) => { processed.push(id); },
    sleep: async () => {},
  };
}

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "ol-wire-"));
  const store = new FileStore(dir);
  return { store, deps: { store, assets: new LocalAssets(join(dir, "assets")), workDir: join(dir, "work") } };
}

test("creates a story once two independent permitted publishers cover an event; ignores single-source and unpermitted leads", async () => {
  const { store, deps } = await setup();
  const processed: string[] = [];
  const leads = [
    lead("l1", "a.jp", "Metro fare to rise 20%"),
    lead("l2", "b.jp", "Metro fare hike approved"),
    lead("l3", "c.example.com", "Metro fare hike: what it means"), // not allowlisted: signal only
    lead("l4", "a.jp", "Typhoon nears Okinawa"), // single publisher: no story yet
  ];
  const r = await ingestCycle(deps, cfg(), effects(leads, processed), new Date("2026-10-12T01:00:00Z"));
  assert.equal(r.newLeads, 4);
  assert.equal(r.ingested, 2, "the single-outlet typhoon lead is not worth fetching yet");
  assert.equal(r.storiesCreated.length, 1);
  assert.deepEqual(processed, r.storiesCreated);
  const story = (await store.get(r.storiesCreated[0]!))!;
  assert.equal(story.sources.length, 2);
  assert.equal(story.story.region, "JP");
  assert.equal(story.story.origin, "wire");
  assert.deepEqual(story.story.languages, ["en", "ja"]);

  // Same leads again: deduped, nothing new.
  const again = await ingestCycle(deps, cfg(), effects(leads, processed), new Date("2026-10-12T01:10:00Z"));
  assert.equal(again.newLeads, 0);
  assert.equal(again.storiesCreated.length, 0);
});

test("new coverage of an existing event updates the story (version bump) instead of creating another", async () => {
  const { store, deps } = await setup();
  const processed: string[] = [];
  const c = cfg({ allowlist: [allow("a.jp", "A"), allow("b.jp", "B"), allow("d.jp", "D")] });
  const first = await ingestCycle(deps, c, effects([lead("l1", "a.jp", "fare up"), lead("l2", "b.jp", "fare up")], processed), new Date("2026-10-12T01:00:00Z"));
  const id = first.storiesCreated[0]!;
  const second = await ingestCycle(deps, c, effects([lead("l5", "d.jp", "fare analysis")], processed), new Date("2026-10-12T01:10:00Z"));
  assert.deepEqual(second.storiesUpdated, [id]);
  const rec = (await store.get(id))!;
  assert.equal(rec.sources.length, 3);
  assert.equal(rec.story.version, 2);
});

test("a primary document alone is enough; daily budget caps pipeline runs", async () => {
  const { deps } = await setup();
  const processed: string[] = [];
  const c = cfg({ allowlist: [allow("gov.jp", "Cabinet Office", "primary")], dailyRunBudget: 0 });
  const r = await ingestCycle(deps, c, effects([lead("p1", "gov.jp", "fare order")], processed), new Date("2026-10-12T01:00:00Z"));
  assert.equal(r.storiesCreated.length, 0);
  assert.equal(r.skippedForBudget, 1);
  const r2 = await ingestCycle(deps, { ...c, dailyRunBudget: 5 }, effects([lead("p2", "gov.jp", "fare order update")], processed), new Date("2026-10-12T01:10:00Z"));
  assert.equal(r2.storiesCreated.length, 1);
});

test("alert feeds cannot start a story alone; stale backlog items are ignored", async () => {
  const { deps } = await setup();
  const processed: string[] = [];
  const c = cfg({
    allowlist: [allow("quake.example.org", "Quake Agency", "primary")],
    feeds: [{ id: "quakes", market: "JP", url: "https://quake.example.org/feed", domain: "quake.example.org", type: "rss", enabled: true, seedsStory: false }],
  });
  const fx = effects([], processed);
  fx.discoverGdelt = async () => [];
  fx.discoverFeed = async () => [
    lead("q1", "quake.example.org", "M5.1 earthquake", { via: "rss", feedId: "quakes" }),
    lead("old", "quake.example.org", "fare history", { via: "rss", feedId: "quakes", publishedAt: "2026-09-01T00:00:00Z" }),
  ];
  const r = await ingestCycle(deps, c, fx, new Date("2026-10-12T01:00:00Z"));
  assert.equal(r.discovered, 2);
  assert.equal(r.newLeads, 1, "backlog item older than maxAgeHours dropped");
  assert.equal(r.storiesCreated.length, 0, "alert feed alone does not seed a story");
});

test("low-risk policy catches up on finished wire stories; sensitive or manual stories stay in review", async () => {
  const { store, deps } = await setup();
  const first = await ingestCycle(deps, cfg(), effects([lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved")], []), new Date("2026-10-12T01:00:00Z"));
  const id = first.storiesCreated[0]!;
  // Pipeline finished while the policy was off.
  const rec = (await store.get(id))!;
  await store.put({ ...rec, story: { ...rec.story, status: "in_review" }, assessment: { headline: "h", neutralSummary: "s", sections: [] } as never });
  const sensitive = { ...rec, story: { ...rec.story, id: "wire-sensitive", status: "in_review" as const, riskTier: "sensitive" as const }, assessment: { headline: "h", neutralSummary: "s", sections: [] } as never };
  await store.put(sensitive);
  const manual = { ...rec, story: { ...rec.story, id: "manual-1", status: "in_review" as const, origin: "manual" as const }, assessment: { headline: "h", neutralSummary: "s", sections: [] } as never };
  await store.put(manual);

  await ingestCycle(deps, cfg({ autoPublish: "low_risk" }), effects([], []), new Date("2026-10-12T01:15:00Z"));
  const after = (await store.get(id))!;
  assert.equal(after.story.status, "published");
  assert.equal(after.story.autoPublished, true);
  assert.equal((await store.get("wire-sensitive"))!.story.status, "in_review");
  assert.equal((await store.get("manual-1"))!.story.status, "in_review");
});

test("wire stories interrupted mid-pipeline (e.g. by a restart) are resumed", async () => {
  const { store, deps } = await setup();
  const first = await ingestCycle(deps, cfg(), effects([lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved")], []), new Date("2026-10-12T01:00:00Z"));
  const id = first.storiesCreated[0]!;
  const rec = (await store.get(id))!;
  await store.put({ ...rec, story: { ...rec.story, status: "researching", updatedAt: "2026-10-12T01:01:00Z" } });
  const soon: string[] = [];
  await ingestCycle(deps, cfg(), effects([], soon), new Date("2026-10-12T01:15:00Z"));
  assert.deepEqual(soon, [], "still within the stuck window");
  const later: string[] = [];
  await ingestCycle(deps, cfg(), effects([], later), new Date("2026-10-12T02:00:00Z"));
  assert.deepEqual(later, [id]);
});

test("events skipped for the per-cycle cap become stories in a later cycle", async () => {
  const { deps } = await setup();
  const leads = [
    lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved"),
    lead("l3", "a.jp", "Typhoon nears Okinawa"), lead("l4", "b.jp", "Typhoon warning for Okinawa"),
  ];
  const first = await ingestCycle(deps, cfg({ maxNewStoriesPerCycle: 1 }), effects(leads, []), new Date("2026-10-12T01:00:00Z"));
  assert.equal(first.storiesCreated.length, 1);
  assert.equal(first.skippedForBudget, 1);
  const second = await ingestCycle(deps, cfg({ maxNewStoriesPerCycle: 1 }), effects([], []), new Date("2026-10-12T01:15:00Z"));
  assert.equal(second.storiesCreated.length, 1);
  assert.notEqual(second.storiesCreated[0], first.storiesCreated[0]);
});

test("pickSources: one article per outlet, primary first, lanes balanced, capped", async () => {
  const { pickSources } = await import("./ingest.js");
  const src = (id: string, publisher: string, rating: "left" | "center" | "right" | "unrated", t: string, sourceType: "primary" | "reporting" = "reporting") =>
    ({ id, storyId: "s", url: `https://${id}.example/a`, publisher, title: id, publishedAt: `2026-10-15T${t}:00Z`, language: "en", sourceType, lens: { rating, ratingBasis: "x" }, rights: { license: "x", usage: "x" }, text: "t" }) as never;
  const all = [
    src("l1", "Left A", "left", "10:00"), src("l2", "Left B", "left", "11:00"), src("l3", "Left C", "left", "12:00"),
    src("l1b", "Left A", "left", "13:00"), // same outlet, newer: replaces l1
    src("r1", "Right A", "right", "09:00"), src("c1", "Center A", "center", "08:00"), src("g1", "Gov", "unrated", "07:00", "primary"),
  ];
  const picked = pickSources(all, 4).map((s: { id: string }) => s.id);
  assert.deepEqual(picked, ["g1", "l1b", "c1", "r1"]);
  // Already-present outlets are not added again; cap counts existing sources.
  const more = pickSources(all, 5, [all[4]!, all[5]!]).map((s: { id: string }) => s.id);
  assert.deepEqual(more, ["g1", "l1b", "l3"]);
});

test("publish-all policy: sensitive, manual and QA-flagged stories go live, flagged ones labelled", async () => {
  const { store, deps } = await setup();
  const first = await ingestCycle(deps, cfg(), effects([lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved")], []), new Date("2026-10-12T01:00:00Z"));
  const rec = (await store.get(first.storiesCreated[0]!))!;
  const a = { headline: "h", neutralSummary: "s", sections: [] } as never;
  await store.put({ ...rec, story: { ...rec.story, id: "sensitive", status: "in_review", riskTier: "sensitive" }, assessment: a });
  await store.put({ ...rec, story: { ...rec.story, id: "manual", status: "in_review", origin: "manual" }, assessment: a });
  await store.put({ ...rec, story: { ...rec.story, id: "flagged", status: "in_review" }, assessment: a,
    qaFlags: [{ severity: "block", kind: "unsupported_established", detail: "x", target: "assessment:established" }] });
  await ingestCycle(deps, cfg({ autoPublish: "all" }), effects([], []), new Date("2026-10-12T01:15:00Z"));
  for (const id of ["sensitive", "manual", "flagged"]) assert.equal((await store.get(id))!.story.status, "published", id);
  assert.equal((await store.get("flagged"))!.story.checksFlagged, true);
  assert.equal((await store.get("sensitive"))!.story.checksFlagged, undefined);
});

test("stale wire stories (e.g. marked for a format upgrade) are re-run once quiet for 30 min", async () => {
  const { store, deps } = await setup();
  const first = await ingestCycle(deps, cfg(), effects([lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved")], []), new Date("2026-10-12T01:00:00Z"));
  const id = first.storiesCreated[0]!;
  const rec = (await store.get(id))!;
  await store.put({ ...rec, story: { ...rec.story, status: "stale", updatedAt: "2026-10-12T00:00:00Z" } });
  const ran: string[] = [];
  await ingestCycle(deps, cfg(), effects([], ran), new Date("2026-10-12T02:00:00Z"));
  assert.deepEqual(ran, [id]);
});

test("live stories without topics get them backfilled", async () => {
  const { store, deps } = await setup();
  const first = await ingestCycle(deps, cfg(), effects([lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved")], []), new Date("2026-10-12T01:00:00Z"));
  const rec = (await store.get(first.storiesCreated[0]!))!;
  await store.put({ ...rec, story: { ...rec.story, status: "published", updatedAt: "2026-10-12T01:05:00Z" } });
  const fx = { ...effects([], []), classify: async () => ["transport", "economy"] };
  await ingestCycle(deps, cfg(), fx, new Date("2026-10-12T01:15:00Z"));
  assert.deepEqual((await store.get(rec.story.id))!.story.topics, ["transport", "economy"]);
});

test("a story re-queued after a restart is not charged to the daily budget twice", async () => {
  const { store, deps } = await setup();
  const first = await ingestCycle(deps, cfg(), effects([lead("l1", "a.jp", "Metro fare to rise 20%"), lead("l2", "b.jp", "Metro fare hike approved")], []), new Date("2026-10-12T01:00:00Z"));
  const id = first.storiesCreated[0]!;
  const rec = (await store.get(id))!;
  await store.put({ ...rec, story: { ...rec.story, status: "researching", updatedAt: "2026-10-12T00:00:00Z" } });
  await ingestCycle(deps, cfg(), effects([], []), new Date("2026-10-12T02:00:00Z"));
  await ingestCycle(deps, cfg(), effects([], []), new Date("2026-10-12T03:00:00Z"));
  assert.equal((await store.getState<{ runs: number }>("budget", { runs: 0 })).runs, 1);
});

import { categoriesOf, categoryCounts, diversityBonus } from "./diversity.js";
import { resumeInterrupted } from "./ingest.js";

test("diversity: an empty section is favoured over a full one, tech and sport over politics, and counts ignore drafts", () => {
  assert.deepEqual(categoriesOf(["technology", "science", "conflict"]).sort(), ["politics", "tech"]);
  const counts = categoryCounts([
    { topics: ["conflict"], status: "published" }, { topics: ["politics"], status: "published" }, { topics: ["diplomacy"], status: "in_review" },
    { topics: ["sport"], status: "draft" },
  ]);
  assert.equal(counts.politics, 3);
  assert.equal(counts.sport, 0, "a draft does not count");
  assert.ok(diversityBonus(["technology"], counts) > diversityBonus(["conflict"], counts), "empty tech beats a full politics");
  assert.ok(diversityBonus(["sport"], counts) > diversityBonus(["technology", "politics"].slice(1), counts));
  assert.equal(diversityBonus(["conflict"], counts), 0);
  assert.equal(diversityBonus([], counts), 0);
});

test("resumeInterrupted re-runs only quiet wire stories still 'researching', newest first, at most the limit", async () => {
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const recent = new Date().toISOString();
  const mk = (id: string, status: string, updatedAt: string, origin = "wire") => ({ id, status, updatedAt, origin });
  const stories = [mk("a", "researching", old), mk("b", "researching", recent), mk("c", "published", old), mk("d", "researching", old, "manual"), mk("e", "researching", new Date(Date.now() - 30 * 60_000).toISOString())];
  const ran: string[] = [];
  const deps = { store: { listStories: async () => stories } } as never;
  const ids = await resumeInterrupted(deps, {} as never, { run: async (id) => void ran.push(id), max: 5 });
  assert.deepEqual(ids, ["a", "e"]);
  assert.deepEqual(ran, ["a", "e"]);
  assert.deepEqual(await resumeInterrupted(deps, {} as never, { run: async () => undefined, max: 1 }), ["a"]);
});
