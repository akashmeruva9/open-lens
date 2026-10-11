import { test } from "node:test";
import assert from "node:assert/strict";
import { mockFetch, withEnv, output, ctx, forbidNetwork } from "./helpers.js";
import { http, HttpError, redact } from "../http.js";
import { oauth1Header } from "../oauth1.js";
import { hasAiDisclosure, xWeightedLength } from "../util.js";
import { channelStatuses, getPublisher, PublishError } from "../index.js";

test("http retries 429 (honouring Retry-After) and 5xx, then succeeds", async () => {
  const m = mockFetch((_c, i) => (i === 0 ? { status: 429, headers: { "retry-after": "0" }, json: {} } : i === 1 ? { status: 503, text: "busy" } : { json: { ok: true } }));
  try {
    const res = await http({ url: "https://api.test/x", label: "t" });
    assert.equal(res.json.ok, true);
    assert.equal(res.attempts, 3);
    assert.equal(m.calls.length, 3);
  } finally {
    m.restore();
  }
});

test("http does not retry 5xx when retry5xx=false, but still retries 429", async () => {
  const m = mockFetch(() => ({ status: 500, json: { error: { message: "boom", code: 1 } } }));
  try {
    await assert.rejects(http({ method: "POST", url: "https://api.test/create", label: "create", retry5xx: false }), (e: unknown) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.status, 500);
      assert.match(e.message, /create: HTTP 500 boom code=1/);
      return true;
    });
    assert.equal(m.calls.length, 1);
  } finally {
    m.restore();
  }
  const m2 = mockFetch((_c, i) => (i < 2 ? { status: 429, json: {} } : { json: { id: "1" } }));
  try {
    const r = await http({ method: "POST", url: "https://api.test/create", label: "create", retry5xx: false });
    assert.equal(r.json.id, "1");
    assert.equal(m2.calls.length, 3);
  } finally {
    m2.restore();
  }
});

test("http gives up after max retries with a structured error", async () => {
  const m = mockFetch(() => ({ status: 502, text: "bad gateway" }));
  try {
    await assert.rejects(http({ url: "https://api.test/x?access_token=SECRET", label: "x", retries: 2 }), (e: unknown) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.attempts, 3);
      assert.ok(!e.url.includes("SECRET"));
      return true;
    });
    assert.equal(m.calls.length, 3);
  } finally {
    m.restore();
  }
});

test("redact strips tokens from keys, bearer strings and URLs", () => {
  const r = redact({ access_token: "abc", nested: { Authorization: "Bearer xyz" }, note: "call https://g.test/?access_token=abc&x=1 with Bearer qwe", id: "keep" });
  assert.deepEqual(r, { access_token: "[REDACTED]", nested: { Authorization: "[REDACTED]" }, note: "call https://g.test/?access_token=[REDACTED]&x=1 with Bearer [REDACTED]", id: "keep" });
});

test("oauth1 signature matches the published X/Twitter example", () => {
  const h = oauth1Header({
    method: "POST",
    url: "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
    consumerKey: "xvz1evFS4wEEPTGEFPHBog",
    consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
    bodyParams: { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
    nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    timestamp: "1318622958",
  });
  // X docs, "Creating a signature": signature = hCtSmYh+iHYCEqBWrE7C7hYmtUk=
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
});

test("X weighted length: URLs=23, emoji=2, CJK=2, Telugu=1 per code point", () => {
  assert.equal(xWeightedLength("hello"), 5);
  assert.equal(xWeightedLength("see https://openlens.app/story/a-very-long-story-slug-that-goes-on"), 4 + 23);
  assert.equal(xWeightedLength("🧵"), 2);
  assert.equal(xWeightedLength("👩‍👩‍👧"), 2);
  assert.equal(xWeightedLength("日本"), 4);
  assert.equal(xWeightedLength("మెట్రో"), [..."మెట్రో"].length);
});

test("AI disclosure detection across languages", () => {
  assert.ok(hasAiDisclosure("Metro fares up. AI-generated presenter."));
  assert.ok(hasAiDisclosure("Narrated by AI"));
  assert.ok(hasAiDisclosure("Presentador generado por IA"));
  assert.ok(hasAiDisclosure("ఈ వీడియో కృత్రిమ మేధ సహాయంతో"));
  assert.ok(!hasAiDisclosure("Metro fares rise 20% from 1 Jan"));
});

test("channelStatuses: only app is live without credentials, with reasons", async () => {
  await withEnv({}, () => {
    const s = channelStatuses();
    assert.deepEqual(s.map((x) => x.channel), ["app", "youtube", "x", "instagram", "facebook", "whatsapp"]);
    assert.equal(s.find((x) => x.channel === "app")!.live, true);
    for (const x of s.filter((x) => x.channel !== "app")) {
      assert.equal(x.live, false);
      assert.match(x.reason!, /missing env/);
    }
  });
  await withEnv({ FB_PAGE_ID: "1", META_PAGE_ACCESS_TOKEN: "t" }, () => {
    assert.equal(getPublisher("facebook").status().live, true);
    assert.equal(getPublisher("instagram").status().live, false);
  });
});

test("app publisher: live without network; refuses unapproved outputs", async () => {
  const net = forbidNetwork();
  try {
    const o = output({ id: "script-en", kind: "script", channel: "app", payload: {} });
    const pub = await getPublisher("app").publish(o, ctx(), { mode: "live" });
    assert.equal(pub.status, "published");
    assert.equal(pub.mode, "live");
    assert.equal(pub.url, "https://openlens.app/story/sample-metro-fare");
    assert.equal(pub.approvedBy, "editor@openlens.app");
    await assert.rejects(getPublisher("app").publish({ ...o, status: "draft" }, ctx(), { mode: "live" }), (e: unknown) => e instanceof PublishError && e.code === "not_approved");
    await assert.rejects(getPublisher("app").publish({ ...o, channel: "x" }, ctx(), { mode: "dry_run" }), (e: unknown) => e instanceof PublishError && e.code === "wrong_channel");
    const corrected = await getPublisher("app").update(pub, { ...o, ledgerVersion: 2 }, ctx());
    assert.equal(corrected.status, "corrected");
    assert.equal(corrected.ledgerVersion, 2);
  } finally {
    net.restore();
  }
});
