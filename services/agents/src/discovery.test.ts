import { test } from "node:test";
import assert from "node:assert/strict";
import { assignLeads, type Candidate } from "./cluster.js";
import { canonicalUrl, gdeltDate, parseFeed, parseGdelt, type Lead } from "./discovery.js";

const feed = { id: "f", market: "JP", domain: "example.go.jp" };

test("parses RSS 2.0, RDF and Atom", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title>運賃改定</title><link>https://www.example.go.jp/a?utm_source=x</link><description>&lt;p&gt;本文&lt;/p&gt;</description><pubDate>Mon, 12 Oct 2026 09:00:00 +0900</pubDate></item></channel></rss>`;
  const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>B</title><link>https://www.example.go.jp/b</link><dc:date>2026-10-12T09:00:00+09:00</dc:date></item></rdf:RDF>`;
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>C</title><link rel="alternate" href="https://www.example.go.jp/c"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>`;
  const [a] = parseFeed(rss, feed);
  assert.equal(a!.url, "https://www.example.go.jp/a");
  assert.equal(a!.publishedAt, "2026-10-12T00:00:00.000Z");
  assert.equal(a!.summary, "本文");
  assert.equal(parseFeed(rdf, feed)[0]!.title, "B");
  assert.equal(parseFeed(atom, feed)[0]!.url, "https://www.example.go.jp/c");
});

test("GDELT parsing tolerates rate-limit text and converts dates", () => {
  assert.deepEqual(parseGdelt("Please limit requests to one every 5 seconds", "JP"), []);
  const leads = parseGdelt(JSON.stringify({ articles: [{ url: "https://n.example.com/x#top", title: "T", seendate: "20261012T101500Z", domain: "n.example.com" }] }), "JP");
  assert.equal(leads[0]!.publishedAt, "2026-10-12T10:15:00Z");
  assert.equal(leads[0]!.url, "https://n.example.com/x");
  assert.equal(gdeltDate("bad").length > 0, true);
  assert.equal(canonicalUrl("https://a.com/p?id=1&utm_medium=x&fbclid=y"), "https://a.com/p?id=1");
});

const lead = (id: string, title: string, market = "JP", domain = `${id}.example.com`): Lead =>
  ({ id, url: `https://${domain}/${id}`, title, publishedAt: "2026-10-12T00:00:00Z", market, domain, via: "rss" });

test("clusters by embedding similarity within a market, not across markets", () => {
  const leads = [lead("a", "x"), lead("b", "y"), lead("c", "z"), lead("d", "w", "KR")];
  const vecs = [[1, 0], [0.95, 0.05], [0, 1], [1, 0]];
  const { candidates } = assignLeads(leads, vecs, [], { now: new Date("2026-10-12T01:00:00Z") });
  assert.equal(candidates.length, 3);
  const ab = candidates.find((c) => c.leadIds.includes("a"))!;
  assert.deepEqual(ab.leadIds, ["a", "b"]);
  assert.deepEqual(ab.domains, ["a.example.com", "b.example.com"]);
});

test("lexical fallback joins headlines about the same event", () => {
  const existing: Candidate[] = [];
  const r = assignLeads([lead("a", "Tokyo metro fares to rise 20 percent in January")], [null], existing, { now: new Date("2026-10-12T01:00:00Z") });
  const r2 = assignLeads([lead("b", "Tokyo metro fares rise 20 percent from January, board says")], [null], r.candidates, { now: new Date("2026-10-12T02:00:00Z") });
  assert.equal(r2.candidates.length, 1);
  assert.equal(r2.candidates[0]!.leadIds.length, 2);
});

test("fetchGdelt surfaces throttling instead of returning silently empty", async () => {
  const { fetchGdelt } = await import("./discovery.js");
  const f = (async () => new Response("Please limit requests to one every 5 seconds", { status: 200 })) as typeof fetch;
  await assert.rejects(fetchGdelt("JP", 30, f), /limit requests/);
});
