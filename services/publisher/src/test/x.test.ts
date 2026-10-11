import { test } from "node:test";
import assert from "node:assert/strict";
import { ctx, forbidNetwork, mockFetch, output, STORY_URL, withEnv } from "./helpers.js";
import { getPublisher, PublishError } from "../index.js";

const x = getPublisher("x");
const OAUTH1 = { X_API_KEY: "ck", X_API_SECRET: "cs", X_ACCESS_TOKEN: "at", X_ACCESS_TOKEN_SECRET: "ats" };
const thread = (posts: string[], extra: Record<string, unknown> = {}) =>
  output({ id: "x-en", kind: "x_thread", channel: "x", payload: { posts, ...extra } });
const GOOD = [
  "Metro fares rise 20% from 1 Jan after a 7-2 board vote. What we know, what's disputed, what's unknown 🧵",
  `Read the evidence: ${STORY_URL}`,
  "Summary narrated by an AI-generated presenter.",
];

test("x dry_run: reply-chained thread with placeholders, no network", async () => {
  const net = forbidNetwork();
  try {
    await withEnv({}, async () => {
      const pub = await x.publish(thread(GOOD), ctx(), { mode: "dry_run" });
      assert.equal(pub.status, "published", pub.error ?? "");
      const reqs = pub.response!.requests as any[];
      assert.equal(reqs.length, 3);
      assert.equal(reqs[0].url, "https://api.x.com/2/tweets");
      assert.deepEqual(reqs[0].body, { text: GOOD[0] });
      assert.deepEqual(reqs[1].body.reply, { in_reply_to_tweet_id: "{{post_1_id}}" });
      assert.deepEqual(reqs[2].body.reply, { in_reply_to_tweet_id: "{{post_2_id}}" });
    });
  } finally {
    net.restore();
  }
});

test("x validation: weighted length, thread length, link, disclosure", async () => {
  await withEnv({}, async () => {
    const long = "日本".repeat(71); // 142 chars, weighted 284
    const r = await x.validate(thread([long, "no link here"]), ctx());
    assert.ok(r.errors.some((e) => /post 1 is 284 weighted chars/.test(e)));
    assert.ok(r.errors.some((e) => /link to the story/.test(e)));
    assert.ok(r.errors.some((e) => /AI disclosure/.test(e)));
    const r2 = await x.validate(thread(Array(9).fill(`${STORY_URL} AI-generated`)), ctx());
    assert.ok(r2.errors.some((e) => /9 posts \(max 8\)/.test(e)));
    // A long URL counts 23, so a post can be > 280 raw chars and still valid
    const urlPost = `${"a".repeat(250)} ${STORY_URL}?utm=${"z".repeat(60)}`;
    const r3 = await x.validate(thread([urlPost, ...GOOD.slice(1)]), ctx());
    assert.deepEqual(r3.errors, []);
    const r4 = await x.validate(thread(GOOD, { videoOutputId: "video-en-916" }), ctx());
    assert.ok(r4.warnings.some((w) => /X_MEDIA_UPLOAD is off/.test(w)));
  });
});

test("x live refuses without credentials", async () => {
  await withEnv({}, async () => {
    await assert.rejects(x.publish(thread(GOOD), ctx(), { mode: "live" }), (e: unknown) => e instanceof PublishError && e.code === "not_live");
  });
});

test("x live: OAuth1-signed thread with reply chaining; correction reply; retract deletes all", async () => {
  let n = 0;
  const m = mockFetch((c) => {
    if (c.method === "POST" && c.url === "https://api.x.com/2/tweets") return { status: 201, json: { data: { id: `t${++n}`, text: c.json.text } } };
    if (c.method === "DELETE") return { json: { data: { deleted: true } } };
    throw new Error(`unexpected ${c.method} ${c.url}`);
  });
  try {
    await withEnv(OAUTH1, async () => {
      const pub = await x.publish(thread(GOOD), ctx(), { mode: "live" });
      assert.equal(pub.status, "published", pub.error ?? "");
      assert.equal(pub.externalId, "t1");
      assert.equal(pub.url, "https://x.com/i/status/t1");
      assert.deepEqual(pub.response!.postIds, ["t1", "t2", "t3"]);
      assert.equal(m.calls.length, 3);
      assert.match(m.calls[0]!.headers.authorization!, /^OAuth oauth_consumer_key="ck".*oauth_signature="/);
      assert.equal(m.calls[0]!.json.reply, undefined);
      assert.deepEqual(m.calls[1]!.json.reply, { in_reply_to_tweet_id: "t1" });
      assert.deepEqual(m.calls[2]!.json.reply, { in_reply_to_tweet_id: "t2" });
      assert.ok(!JSON.stringify(pub).includes('"ats"'));

      const corr = await x.update(pub, thread(GOOD), ctx(undefined, { correctionNote: "Vote was 6-3." }));
      assert.equal(corr.status, "corrected");
      assert.deepEqual(m.calls[3]!.json.reply, { in_reply_to_tweet_id: "t3" });
      assert.match(m.calls[3]!.json.text, /^Correction \(.*\): Vote was 6-3\./);

      const ret = await x.retract(corr, ctx());
      assert.equal(ret.status, "retracted");
      assert.deepEqual(m.calls.slice(4).map((c) => `${c.method} ${c.url}`), [
        "DELETE https://api.x.com/2/tweets/t3",
        "DELETE https://api.x.com/2/tweets/t2",
        "DELETE https://api.x.com/2/tweets/t1",
      ]);
    });
  } finally {
    m.restore();
  }
});

test("x live: 5xx on tweet create is not retried; partial thread is reported", async () => {
  let n = 0;
  const m = mockFetch(() => (++n === 1 ? { status: 201, json: { data: { id: "t1" } } } : { status: 503, json: { title: "Service Unavailable", detail: "try later" } }));
  try {
    await withEnv({ X_OAUTH2_USER_TOKEN: "u2" }, async () => {
      const pub = await x.publish(thread(GOOD), ctx(), { mode: "live" });
      assert.equal(pub.status, "failed");
      assert.equal(m.calls.length, 2); // no retry of the failed create
      assert.equal(m.calls[0]!.headers.authorization, "Bearer u2");
      assert.equal(pub.externalId, "t1");
      assert.deepEqual(pub.response!.postIds, ["t1"]);
      assert.match(pub.error!, /thread stopped at post 2\/3: x.tweets.create: HTTP 503 Service Unavailable: try later/);
    });
  } finally {
    m.restore();
  }
});

test("x live with X_MEDIA_UPLOAD: chunked upload then media attached to first post", async () => {
  const m = mockFetch((c) => {
    if (c.url.endsWith("/2/media/upload/initialize")) return { json: { data: { id: "m1" } } };
    if (c.url.endsWith("/2/media/upload/m1/append")) return { status: 204 };
    if (c.url.endsWith("/2/media/upload/m1/finalize")) return { json: { data: { id: "m1", processing_info: { state: "pending", check_after_secs: 0 } } } };
    if (c.url.includes("command=STATUS")) return { json: { data: { processing_info: { state: "succeeded" } } } };
    if (c.url.endsWith("/2/tweets")) return { json: { data: { id: `t${c.json.media ? 1 : 2}` } } };
    throw new Error(`unexpected ${c.url}`);
  });
  try {
    await withEnv({ ...OAUTH1, X_MEDIA_UPLOAD: "true" }, async () => {
      const pub = await x.publish(thread(GOOD.slice(0, 2).concat(GOOD[2]!), { videoOutputId: "video-en-916" }), ctx(), { mode: "live" });
      assert.equal(pub.status, "published", pub.error ?? "");
      assert.equal(m.calls[0]!.json.media_category, "tweet_video");
      assert.ok(m.calls[1]!.body instanceof FormData);
      const firstTweet = m.calls.find((c) => c.url.endsWith("/2/tweets"))!;
      assert.deepEqual(firstTweet.json.media, { media_ids: ["m1"] });
    });
  } finally {
    m.restore();
  }
});
