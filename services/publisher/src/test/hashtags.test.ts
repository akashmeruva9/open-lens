import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTag, hashtagsFor, withHashtags } from "../hashtags.js";
import { output } from "./helpers.js";

const yt = (lang = "en") => output({ id: `yt-${lang}`, kind: "yt_meta", channel: "youtube", lang, payload: { title: "t", description: "Facts. Read the evidence: https://x.test/story/a", tags: ["Ukraine", "Elon Musk", "Starlink", "OpenLens"] } });
const ig = (lang = "en") => output({ id: `ig-${lang}`, kind: "ig_reel", channel: "instagram", lang, payload: { caption: "c", hashtags: ["#Ukraine", "#Starlink", "#DefenseTech"], videoOutputId: "v" } });
const fb = (lang = "en") => output({ id: `fb-${lang}`, kind: "fb_post", channel: "facebook", lang, payload: { message: "Hello world", link: "https://x.test/story/a" } });
const ctx = (extra: Record<string, unknown> = {}) => ({ topics: ["conflict", "politics", "technology"], region: "WORLD", siblings: [yt(), ig(), fb()], ...extra });

test("cleanTag keeps letters and digits, drops spaces and punctuation, rejects numbers and long tags", () => {
  assert.equal(cleanTag("Elon Musk"), "ElonMusk");
  assert.equal(cleanTag("#U.S. Navy!"), "USNavy");
  assert.equal(cleanTag("ウクライナ"), "ウクライナ");
  assert.equal(cleanTag("2026"), undefined);
  assert.equal(cleanTag("a"), undefined);
  assert.equal(cleanTag("x".repeat(31)), undefined);
});

test("instagram: the agents' hashtags first, then topic and reach tags and the brand, at most 10", () => {
  const out = withHashtags(ig(), ctx());
  const tags = out.payload.hashtags as string[];
  assert.deepEqual(tags.slice(0, 3), ["#Ukraine", "#Starlink", "#DefenseTech"]);
  assert.ok(tags.includes("#OpenLens"));
  assert.ok(tags.includes("#Geopolitics") && tags.includes("#News"));
  assert.ok(tags.length <= 10);
  assert.equal(new Set(tags.map((t) => t.toLowerCase())).size, tags.length, "no duplicates");
});

test("youtube: a hashtag line in the description, story tags then the brand first, #Shorts for vertical video", () => {
  const out = withHashtags(yt(), ctx(), { vertical: true });
  const desc = out.payload.description as string;
  const line = desc.split("\n\n").at(-1)!;
  assert.match(line, /^#Ukraine #Starlink #OpenLens /);
  assert.ok(line.includes("#Shorts"));
  assert.ok(line.split(" ").length <= 8);
  assert.ok(desc.startsWith("Facts. Read the evidence: https://x.test/story/a"));
  assert.ok(!hashtagsFor(yt(), ctx(), { vertical: false }).includes("#Shorts"));
});

test("facebook: up to four tags appended to the message", () => {
  const out = withHashtags(fb(), ctx());
  const msg = out.payload.message as string;
  assert.match(msg, /^Hello world\n\n#Ukraine #Starlink #Geopolitics #OpenLens$/);
});

test("idempotent: running twice adds nothing more, and tags already in the text are not repeated", () => {
  const once = withHashtags(yt(), ctx(), { vertical: true });
  assert.deepEqual(withHashtags(once, ctx(), { vertical: true }).payload, once.payload);
  const already = output({ id: "fb", kind: "fb_post", channel: "facebook", lang: "en", payload: { message: "Big news #Ukraine today", link: "https://x.test/story/a" } });
  const out = (withHashtags(already, ctx()).payload.message as string).split("\n\n").at(-1)!;
  assert.ok(!out.includes("#Ukraine"));
});

test("japanese posts get Japanese topic and reach tags; a market story adds the market", () => {
  const jaCtx = { topics: ["conflict", "economy"], region: "JP", siblings: [yt("ja"), ig("ja")] };
  const tags = hashtagsFor(ig("ja"), jaCtx);
  assert.ok(tags.includes("#国際情勢") || tags.includes("#経済"));
  assert.ok(tags.includes("#ニュース"));
  assert.ok(tags.includes("#日本"));
  const en = hashtagsFor(ig("en"), { ...ctx(), region: "AU" });
  assert.ok(en.includes("#Australia"));
  assert.ok(!hashtagsFor(ig("en"), ctx({ region: "APAC" })).includes("#AsiaPacific"));
});

test("posts of other kinds are left alone", () => {
  const car = output({ id: "c", kind: "carousel", channel: "instagram", payload: { caption: "c", slides: [] } });
  assert.equal(withHashtags(car, ctx()), car);
});
