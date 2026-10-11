// Builds data/fixtures/story-bundle.json + feed.json from the seed story's ledger output.
// Fixture is for frontend development only; the story is FICTIONAL.
import { readFileSync, writeFileSync } from "node:fs";
import { FeedItem, StoryBundle } from "@openlens/schemas";

const sources = JSON.parse(readFileSync("data/seed/sample-story/sources.json", "utf8"));
const ledger = JSON.parse(readFileSync("data/seed/sample-story/out/ledger.json", "utf8"));
const now = "2026-10-12T10:00:00Z";
const id = "sample-metro-fare";
const claims = ledger.claims.map((c: any) => ({ ...c, state: ["c3", "c11"].includes(c.id) ? "supported" : c.state }));
const out = (o: any) => ({ storyId: id, ledgerVersion: 1, aiDisclosure: true, dependsOn: [], createdAt: now, updatedAt: now, ...o });
const script = (lang: string, title: string, lines: [string, string, string[]][]) =>
  out({ id: `script-${lang}`, kind: "script", channel: "app", lang, status: "approved", claimIds: [...new Set(lines.flatMap((l) => l[2]))],
        payload: { title, presenter: lang === "te" ? "priya-te" : "arjun-en", lines: lines.map(([label, text, claimIds]) => ({ label, text, claimIds })) } });

const bundle = StoryBundle.parse({
  story: { id, title: "Metro fares to rise 20% from January (FICTIONAL SAMPLE)", summary: ledger.assessment.neutralSummary,
    region: "IN-TG", topics: ["transport", "civic"], languages: ["en", "hi", "te", "es"], riskTier: "low", status: "published",
    version: 1, createdAt: now, updatedAt: now },
  sources: sources.map((s: any) => ({ ...s })),
  claims,
  lanes: [
    { lens: "left", sourceIds: ["s2"], summary: "Frames the hike as a burden on low-income commuters and argues for a subsidy instead.",
      emphasizes: ["Impact on low-income riders", "Subsidy alternative"], doesNotEstablish: ["The 600-rupee figure is anecdotal, from riders"], claimIds: ["c5", "c6", "c7"], modelGenerated: true },
    { lens: "center", sourceIds: ["s1"], summary: "Reports the decision, the board vote and the Authority's stated reason.",
      emphasizes: ["7-2 board vote", "Electricity costs as stated reason"], doesNotEstablish: ["Whether alternatives were evaluated"], claimIds: ["c1", "c2", "c3", "c4"], modelGenerated: true },
    { lens: "right", sourceIds: ["s3"], summary: "Frames the hike as an overdue fiscal correction after six years without revision.",
      emphasizes: ["No revision in six years", "Deficit risk"], doesNotEstablish: ["Deficit forecast is not independently audited"], claimIds: ["c8", "c9", "c10", "c11"], modelGenerated: true },
  ],
  context: [
    { id: "ctx1", kind: "official_order", title: "Metro Authority board resolution (fictional)", summary: "Board resolution approving fare revision effective 1 January.", groundingUrls: [] },
    { id: "ctx2", kind: "prior_action", title: "Last fare revision (fictional)", summary: "Fares were last revised six years ago.", groundingUrls: [] },
  ],
  timeline: [
    { date: "2020", text: "Last fare revision", claimIds: ["c9"], contextIds: ["ctx2"] },
    { date: "2026-10-01", text: "Board approves 20% hike in 7-2 vote", claimIds: ["c3"], contextIds: ["ctx1"] },
    { date: "2027-01-01", text: "New fares take effect", claimIds: ["c1"], contextIds: [] },
  ],
  assessment: { ...ledger.assessment, sections: ledger.assessment.sections.map((s: any) =>
    s.kind === "established" ? { ...s, claimIds: ["c3", "c11"], text: "The board approved the fare rise in a 7-2 vote, and the Authority's annual report shows electricity costs rose 35 percent." } : s) },
  outputs: [
    script("en", "Metro fares up 20%: what we know", [
      ["WHAT HAPPENED", "The Metro Authority's board approved a 20 percent fare rise from 1 January, in a 7-2 vote.", ["c1", "c3"]],
      ["WHY", "The Authority cites electricity costs, which its annual report says rose 35 percent.", ["c2", "c11"]],
      ["THE DEBATE", "Commuter advocates want a subsidy instead; analysts call the hike overdue.", ["c6", "c8"]],
      ["UNKNOWN", "Whether a subsidy was considered before the vote is not yet known.", ["c6"]],
    ]),
    script("te", "మెట్రో ఛార్జీలు 20% పెంపు", [
      ["ఏమి జరిగింది", "మెట్రో ఛార్జీలు జనవరి 1 నుంచి 20 శాతం పెరుగుతాయి.", ["c1", "c3"]],
      ["ఎందుకు", "విద్యుత్ ఖర్చులు 35 శాతం పెరిగాయని అథారిటీ చెబుతోంది.", ["c2", "c11"]],
      ["తెలియనివి", "ప్రభుత్వ సబ్సిడీ పరిశీలనలో ఉందో లేదో స్పష్టంగా లేదు.", ["c6"]],
    ]),
    out({ id: "video-en-916", kind: "video", channel: "app", lang: "en", status: "approved", claimIds: ["c1", "c3", "c11"], dependsOn: ["script-en"],
      payload: { aspect: "9:16", mp4Url: "/assets/sample-metro-fare/video-en-916.mp4", hlsUrl: "/assets/sample-metro-fare/video-en-916/index.m3u8", durationSeconds: 24, scriptOutputId: "script-en" } }),
    out({ id: "yt-te", kind: "yt_meta", channel: "youtube", lang: "te", tier: "regional", status: "approved", claimIds: ["c1", "c3"], dependsOn: ["script-te"],
      payload: { tier: "regional", title: "మెట్రో ఛార్జీలు 20% పెంపు | OpenLens", description: "మూలాలు: ...\nAI-generated presenter / narration.", tags: ["metro", "news"], containsSyntheticMedia: true } }),
    out({ id: "x-en", kind: "x_thread", channel: "x", lang: "en", status: "needs_review", staleReason: "claim c6 edited", claimIds: ["c1", "c6"], dependsOn: ["script-en"],
      payload: { posts: ["Metro fares rise 20% from 1 Jan after a 7-2 board vote. What we know, what's disputed, what's unknown 🧵", "Read the evidence: https://openlens.app/story/sample-metro-fare"] } }),
    out({ id: "ig-en", kind: "ig_reel", channel: "instagram", lang: "en", status: "draft", claimIds: ["c1"], dependsOn: ["video-en-916"],
      payload: { caption: "Metro fares up 20% — swipe the lenses in the OpenLens app. AI-generated presenter.", hashtags: ["#metro", "#OpenLens"], videoOutputId: "video-en-916" } }),
    out({ id: "fb-en", kind: "fb_post", channel: "facebook", lang: "en", status: "draft", claimIds: ["c1", "c3"], dependsOn: ["script-en"],
      payload: { message: "Metro fares will rise 20% from 1 January. Here's what the sources agree on and where they differ.", link: "https://openlens.app/story/sample-metro-fare" } }),
    out({ id: "wa-te", kind: "wa_digest", channel: "whatsapp", lang: "te", status: "draft", claimIds: ["c1"], dependsOn: ["script-te"],
      payload: { templateName: "daily_digest_te", params: ["మెట్రో ఛార్జీలు 20% పెంపు"], previewText: "నేటి వార్త: మెట్రో ఛార్జీలు 20% పెంపు", link: "https://openlens.app/story/sample-metro-fare" } }),
  ],
  publications: [],
  corrections: [],
});
writeFileSync("data/fixtures/story-bundle.json", JSON.stringify(bundle, null, 2));

const feed = [bundle].map((b) => FeedItem.parse({
  id: b.story.id, title: b.story.title, summary: b.story.summary, region: b.story.region, topics: b.story.topics,
  languages: b.story.languages, status: b.story.status, updatedAt: b.story.updatedAt, sourceCount: b.sources.length,
  lensesCovered: b.lanes.map((l) => l.lens),
  evidence: { supported: b.claims.filter((c) => c.state === "supported").length, contested: b.claims.filter((c) => c.state === "contested").length,
              unverified: b.claims.filter((c) => c.state === "unverified").length },
  videoUrl: "/assets/sample-metro-fare/video-en-916.mp4", corrected: false,
}));
writeFileSync("data/fixtures/feed.json", JSON.stringify(feed, null, 2));
console.log("fixtures written:", bundle.claims.length, "claims,", bundle.outputs.length, "outputs");
