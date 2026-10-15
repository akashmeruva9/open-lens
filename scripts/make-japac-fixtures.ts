// Fictional JAPAC fixture stories for UI development (fixture mode only). Clearly labelled FICTIONAL.
import { readFileSync, writeFileSync } from "node:fs";
import { languagesFor } from "@openlens/config";
import { FeedItem, StoryBundle } from "@openlens/schemas";

const base = StoryBundle.parse(JSON.parse(readFileSync("data/fixtures/story-bundle.json", "utf8")));
const items: [string, string, string, string, string[], number][] = [
  // id, region, title, summary, topics, hours ago
  ["jp-typhoon-drill", "JP", "Tokyo runs region-wide typhoon evacuation drill (FICTIONAL)", "Sample story for UI testing: officials tested shelters and alerts across 23 wards.", ["climate"], 1],
  ["kr-chip-exports", "KR", "Korea's chip exports rise for a third month (FICTIONAL)", "Sample story: customs data shows semiconductor shipments up, analysts split on demand.", ["economy", "tech"], 2],
  ["in-heatwave-schools", "IN-TG", "Telangana shifts school hours during heatwave (FICTIONAL)", "Sample story: classes move to mornings; parents and unions react.", ["health", "education"], 3],
  ["id-ferry-safety", "ID", "Indonesia tightens ferry safety checks (FICTIONAL)", "Sample story: new inspections after a series of incidents; operators cite costs.", ["society"], 5],
  ["tw-transit-pass", "TW", "Taipei launches monthly transit pass pilot (FICTIONAL)", "Sample story: unlimited rides for commuters; city council debates funding.", ["transport"], 6],
  ["au-water-rates", "AU", "Sydney water rates to rise from July (FICTIONAL)", "Sample story: regulator approves increase; consumer groups object.", ["economy"], 8],
  ["th-air-quality", "TH", "Bangkok issues PM2.5 work-from-home advisory (FICTIONAL)", "Sample story: city urges remote work as haze returns.", ["health", "climate"], 9],
  ["ph-rice-prices", "PH", "Philippines caps rice prices for 60 days (FICTIONAL)", "Sample story: executive order sets ceiling; traders warn of shortages.", ["economy"], 12],
  ["apac-quake-response", "APAC", "How Asia-Pacific agencies share quake alerts (FICTIONAL)", "Sample explainer: regional warning systems and what changed this year.", ["climate"], 20],
];
const now = Date.parse("2026-10-15T09:00:00Z");
const bundles = items.map(([id, region, title, summary, topics, h], i) => {
  const at = new Date(now - h * 3600_000).toISOString();
  const withVideo = i % 3 !== 2; // every third story has no video -> poster card
  const b = structuredClone(base);
  b.story = { ...b.story, id, title, summary, region, topics, languages: languagesFor([region]), createdAt: at, updatedAt: at, status: i === 4 ? "corrected" : "published" };
  b.sources = b.sources.map((s) => ({ ...s, storyId: id }));
  b.claims = b.claims.map((c) => ({ ...c, storyId: id }));
  b.assessment = b.assessment && { ...b.assessment, storyId: id, headline: title, neutralSummary: summary };
  b.outputs = b.outputs
    .filter((o) => o.kind !== "video" || withVideo)
    .map((o) => ({ ...o, storyId: id, createdAt: at, updatedAt: at, status: o.kind === "video" || o.kind === "script" ? "approved" : o.status }));
  b.corrections = i === 4 ? [{ id: `corr-${id}`, storyId: id, at, by: "editor@dev", reason: "Fare figure updated (sample)", changedClaimIds: ["c1"], fromVersion: 1, toVersion: 2, impactedOutputIds: [], impactedPublicationIds: [] }] : [];
  b.publications = [];
  return StoryBundle.parse(b);
});
writeFileSync("data/fixtures/japac-bundles.json", JSON.stringify(bundles, null, 2));
const feed = bundles.map((b) => FeedItem.parse({
  id: b.story.id, title: b.story.title, summary: b.story.summary, region: b.story.region, topics: b.story.topics, languages: b.story.languages,
  status: b.story.status, updatedAt: b.story.updatedAt, sourceCount: b.sources.length, lensesCovered: b.lanes.map((l) => l.lens),
  evidence: { supported: b.claims.filter((c) => c.state === "supported").length, contested: b.claims.filter((c) => c.state === "contested").length, unverified: b.claims.filter((c) => c.state === "unverified").length },
  videoUrl: b.outputs.find((o) => o.kind === "video")?.payload.mp4Url as string | undefined, corrected: b.corrections.length > 0,
}));
writeFileSync("data/fixtures/japac-feed.json", JSON.stringify(feed, null, 2));
console.log(`${bundles.length} fictional JAPAC bundles; ${bundles.filter((b) => b.outputs.some((o) => o.kind === "video")).length} with video`);
