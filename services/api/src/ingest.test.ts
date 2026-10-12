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
  maxNewStoriesPerCycle: 3, maxUpdatesPerCycle: 3, dailyRunBudget: 10, maxConcurrentRuns: 1, minPublishers: 2, autoPublish: "off", autoMediaLangs: [], ...over,
});
const lead = (id: string, domain: string, title: string): Lead => ({ id, url: `https://${domain}/${id}`, title, publishedAt: "2026-10-12T00:00:00Z", market: "JP", domain, via: "gdelt" });

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
  assert.equal(r.ingested, 3);
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
