import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoryBundle } from "@openlens/schemas";
import { LocalAssets } from "./assets.js";
import { createApp } from "./app.js";
import { FileStore } from "./store.js";
import { claimDocsOf, computeStatus, cosine, enqueue, geminiJudge, keywordScore, Judgement, Verifier, type ClaimDoc, type Relation } from "./verify.js";

const fixture = async () => JSON.parse(await readFile(new URL("./testdata/story-bundle.json", import.meta.url), "utf8")) as StoryBundle;

/** Bag-of-words vectors: texts that share words score high. Deterministic stand-in for the embedding model. */
const embed = async (texts: string[]) =>
  texts.map((t) => {
    const v = new Array(1024).fill(0);
    for (const w of t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
      let h = 0;
      for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 1024;
      v[h] += 1;
    }
    return v;
  });

const doc = (over: Partial<ClaimDoc> = {}): ClaimDoc => ({ storyId: "s", storyTitle: "Story", claimId: "c1", text: "Metro fares will rise by 20 percent from 1 January.", state: "supported", sources: [{ publisher: "Gazette", url: "https://g.test/a" }], ...over });

test("computeStatus: rules from relations and evidence states, never from the model", () => {
  const f = (relation: Relation, state: ClaimDoc["state"]) => ({ relation, state });
  assert.equal(computeStatus([]), "not_covered");
  assert.equal(computeStatus([f("related", "supported")]), "related_only");
  assert.equal(computeStatus([f("supports", "supported")]), "supported");
  assert.equal(computeStatus([f("contradicts", "supported")]), "contradicted");
  assert.equal(computeStatus([f("supports", "supported"), f("contradicts", "supported")]), "contradicted");
  assert.equal(computeStatus([f("supports", "contested")]), "disputed");
  assert.equal(computeStatus([f("supports", "supported"), f("contradicts", "attributed")]), "disputed");
  assert.equal(computeStatus([f("supports", "attributed")]), "unconfirmed");
  assert.equal(computeStatus([f("supports", "unverified")]), "unconfirmed");
});

test("claimDocsOf: skips superseded claims, names the outlets once, uses the assessment headline", async () => {
  const b = await fixture();
  b.claims[0]!.state = "superseded";
  const docs = claimDocsOf([b]);
  assert.equal(docs.length, b.claims.length - 1);
  assert.ok(!docs.some((d) => d.claimId === "c1"));
  const c3 = docs.find((d) => d.claimId === "c3")!;
  assert.ok(c3.sources.length >= 1 && new Set(c3.sources.map((s) => s.url)).size === c3.sources.length);
  assert.equal(c3.storyId, "sample-metro-fare");
});

test("keywordScore and cosine", () => {
  assert.ok(keywordScore("Metro fares rise 20 percent", "Metro fares will rise by 20 percent from 1 January.") >= 0.8);
  assert.equal(keywordScore("completely unrelated words here", "Metro fares will rise by 20 percent."), 0);
  assert.ok(keywordScore("地下鉄の運賃が値上げ", "地下鉄の運賃は1月から値上げされる") > 0.3);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});

test("Verifier: a matching supported claim the judge marks as supporting gives 'supported'", async () => {
  const v = new Verifier({ docs: async () => [doc(), doc({ claimId: "c2", text: "The board approved the plan in a 7-2 vote." })], embed, judge: async () => ({ c1: "supports" }), minSimilarity: 0.5 });
  const r = await v.verify("Metro fares will rise by 20 percent in January");
  assert.equal(r.status, "supported");
  assert.equal(r.findings[0]!.claimId, "c1");
  assert.equal(r.findings[0]!.relation, "supports");
  assert.equal(r.matching, "semantic");
  assert.deepEqual(r.stories, [{ id: "s", title: "Story" }]);
});

test("Verifier: no match is 'not_covered'; a match the judge cannot place is 'related_only'", async () => {
  const docs = async () => [doc()];
  assert.equal((await new Verifier({ docs, embed, minSimilarity: 0.5 }).verify("Penguins migrate across the frozen southern ocean")).status, "not_covered");
  const r = await new Verifier({ docs, embed, judge: async () => { throw new Error("model down"); }, minSimilarity: 0.5 }).verify("Metro fares will rise by 20 percent in January");
  assert.equal(r.status, "related_only");
  assert.equal(r.findings[0]!.relation, "related");
});

test("Verifier: falls back to keywords when embeddings fail, and caches claim vectors between checks", async () => {
  const docs = async () => [doc()];
  const broken = new Verifier({ docs, embed: async () => { throw new Error("quota"); }, minKeywordScore: 0.5 });
  const r = await broken.verify("Metro fares will rise by 20 percent");
  assert.equal(r.matching, "keywords");
  assert.equal(r.findings.length, 1);
  let calls = 0;
  const counting = new Verifier({ docs, embed: async (t) => { calls++; return embed(t); }, minSimilarity: 0.5 });
  await counting.verify("Metro fares will rise by 20 percent");
  await counting.verify("Metro fares go up 20 percent next month");
  assert.equal(calls, 3, "claims embedded once (1 call), then one call per statement");
});

test("Verifier: claim vectors are persisted per story and reloaded after a restart without embedding again", async () => {
  const saved = new Map<string, Record<string, number[]>>();
  const cache = { get: async (sid: string) => saved.get(sid) ?? {}, put: async (sid: string, v: Record<string, number[]>) => void saved.set(sid, v) };
  const docs = async () => [doc(), doc({ claimId: "c2", storyId: "t", text: "The board approved the plan in a 7-2 vote." })];
  let calls = 0;
  const countingEmbed = async (t: string[]) => { calls++; return embed(t); };
  await new Verifier({ docs, embed: countingEmbed, cache, minSimilarity: 0.5 }).warm();
  assert.equal(calls, 1);
  assert.deepEqual([...saved.keys()].sort(), ["s", "t"]);
  const restarted = new Verifier({ docs, embed: countingEmbed, cache, minSimilarity: 0.5 });
  const r = await restarted.verify("Metro fares will rise by 20 percent in January");
  assert.equal(calls, 2, "only the statement was embedded after the restart");
  assert.equal(r.findings[0]!.claimId, "c1");
});

test("Verifier: a slow vector build or a slow judge never keeps the visitor waiting", async () => {
  const docs = async () => [doc()];
  const slowEmbed = async (t: string[]) => (t.length > 1 || t[0] !== "Metro fares will rise by 20 percent" ? new Promise<number[][]>((r) => setTimeout(() => r(embed(t)), 300)) : embed(t));
  const v = new Verifier({ docs, embed: slowEmbed, vectorWaitMs: 20, minKeywordScore: 0.5 });
  assert.equal((await v.verify("Metro fares will rise by 20 percent")).matching, "keywords");
  const slowJudge = new Verifier({ docs, embed, judge: () => new Promise((r) => setTimeout(() => r({ c1: "supports" }), 300)), judgeWaitMs: 20, minSimilarity: 0.5 });
  assert.equal((await slowJudge.verify("Metro fares will rise by 20 percent in January")).status, "related_only");
});

test("Verifier.warm: builds the vectors and makes one warm-up call to the judge", async () => {
  let judged = 0;
  const v = new Verifier({ docs: async () => [doc()], embed, judge: async () => { judged++; return {}; } });
  await v.warm();
  assert.equal(judged, 1);
  await new Verifier({ docs: async () => [doc()], embed, judge: async () => { throw new Error("down"); } }).warm(); // never throws
});

test("geminiJudge keeps only ids it was shown and ignores anything else", async () => {
  const judge = geminiJudge(async () => ({ data: Judgement.parse({ relations: [{ id: "c1", relation: "supports" }, { id: "c99", relation: "contradicts" }] }) }));
  assert.deepEqual(await judge("x", [{ id: "c1", text: "a", state: "supported" }]), { c1: "supports" });
});

test("enqueue: deduplicated by wording, counted, newest first, capped", () => {
  let q = enqueue([], "Is the moon made of cheese?", "2026-10-18T10:00:00Z");
  q = enqueue(q, "is the MOON made of cheese", "2026-10-18T11:00:00Z");
  assert.equal(q.length, 1);
  assert.equal(q[0]!.count, 2);
  q = enqueue(q, "Another unanswered claim", "2026-10-18T12:00:00Z");
  assert.equal(q[0]!.text, "Another unanswered claim");
  assert.equal(enqueue(q, "third", "2026-10-18T13:00:00Z", 2).length, 2);
});

async function appWith(verifier: Verifier, env: Record<string, string> = {}, link?: { fetchPage?: (u: string) => Promise<{ finalUrl: string; body: string }>; extract?: (t: string, x: string) => Promise<string[]> }) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  const dir = await mkdtemp(join(tmpdir(), "ol-verify-"));
  const store = new FileStore(dir);
  const app = createApp({ store, assets: new LocalAssets(join(dir, "assets")), workDir: join(dir, "work") }, undefined, { verifier, link });
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  const post = (text: unknown, ip = "1.1.1.1") => app.request("/v1/verify", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ text }) });
  return { app, post };
}

test("POST /v1/verify: validates the statement and answers from the ledger; unanswered statements are queued for editors", async () => {
  const v = new Verifier({ docs: async () => claimDocsOf([await fixture()]), embed, judge: async (st): Promise<Record<string, Relation>> => (/metro/i.test(st) ? { c1: "supports" } : {}), minSimilarity: 0.5 });
  const { app, post } = await appWith(v);
  assert.equal((await post("short")).status, 400);
  assert.equal((await post("x".repeat(601))).status, 400);
  const ok = await post("Metro fares will rise by 20 percent from 1 January");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.json();
  assert.ok(["supported", "unconfirmed", "disputed", "related_only"].includes(body.status));
  assert.ok(body.findings.length >= 1 && body.findings[0].sources.length >= 1);
  const miss = await (await post("Penguins migrate across the frozen southern ocean every winter")).json();
  assert.equal(miss.status, "not_covered");
  const queue = await (await app.request("/v1/studio/verify-queue", { headers: { "x-dev-user": "editor@test" } })).json();
  assert.equal(queue.length, 1);
  assert.match(queue[0].text, /Penguins/);
});

test("POST /v1/verify with a link: reads the article, checks each claim, queues what is not covered, never queues the link", async () => {
  const article = `<html><head><title>Metro fares to rise</title></head><body><article><p>Metro fares will rise by 20 percent from 1 January, the Metro Authority said on Tuesday after a board vote.</p><p>Penguins migrate across the frozen southern ocean every winter, according to a researcher quoted in the same piece.</p><p>${"The report continues with more background about the transport network and its riders. ".repeat(4)}</p></article></body></html>`;
  const v = new Verifier({ docs: async () => claimDocsOf([await fixture()]), embed, judge: async (st): Promise<Record<string, Relation>> => (/metro/i.test(st) ? { c1: "supports" } : {}), minSimilarity: 0.5 });
  const { app, post } = await appWith(v, {}, {
    fetchPage: async (u) => ({ finalUrl: u, body: article }),
    extract: async () => ["Metro fares will rise by 20 percent from 1 January.", "Penguins migrate across the frozen southern ocean every winter.", "The Moon is made entirely of green cheese and always was."],
  });
  const r = await post("https://news.example.com/metro-fares");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.kind, "article");
  assert.equal(body.title, "Metro fares to rise");
  assert.equal(body.claims.length, 2, "the made-up claim that is not in the article is dropped");
  assert.equal(body.summary.checked, 2);
  assert.ok(body.claims.some((c: { status: string }) => c.status !== "not_covered"));
  const queue = await (await app.request("/v1/studio/verify-queue", { headers: { "x-dev-user": "editor@test" } })).json();
  assert.equal(queue.length, 1);
  assert.match(queue[0].text, /Penguins/);
  assert.ok(!queue.some((q: { text: string }) => /^https?:/.test(q.text)));
  assert.equal((await post("Defence metals are becoming a geopolitical asset class, see https://mining.com.au/x")).status, 200, "a sentence that contains a link is still a sentence");
});

test("POST /v1/verify with a link: when the AI service is down the visitor gets a plain message, not an error page", async () => {
  const v = new Verifier({ docs: async () => [], embed });
  const { post } = await appWith(v, {}, {
    fetchPage: async (u) => ({ finalUrl: u, body: `<article><p>${"Fares will rise by 20 percent from January, the authority said on Tuesday. ".repeat(5)}</p></article>` }),
    extract: async () => { throw new Error('{"error":{"code":403,"status":"PERMISSION_DENIED"}}'); },
  });
  const r = await post("https://news.example.com/a-story");
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /AI service is not available right now.*single sentence/);
});

test("POST /v1/verify with a link: private addresses and bad schemes are refused with a clear message", async () => {
  const v = new Verifier({ docs: async () => [], embed });
  const { post } = await appWith(v);
  for (const bad of ["http://localhost/admin", "http://169.254.169.254/computeMetadata/v1/", "http://10.0.0.5/x", "http://127.0.0.1:8080/", "https://example.com:8443/x"]) {
    const r = await post(bad);
    assert.equal(r.status, 422, `${bad} -> ${r.status}`);
    assert.match((await r.json()).error, /public website|unusual port|could not find/);
  }
});

test("POST /v1/verify: rate limit per visitor", async () => {
  const v = new Verifier({ docs: async () => [], embed });
  const { post } = await appWith(v, { VERIFY_PER_MINUTE: "2" });
  assert.equal((await post("A perfectly valid statement one")).status, 200);
  assert.equal((await post("A perfectly valid statement two")).status, 200);
  assert.equal((await post("A perfectly valid statement three")).status, 429);
  assert.equal((await post("A perfectly valid statement four", "2.2.2.2")).status, 200, "another visitor is unaffected");
});
