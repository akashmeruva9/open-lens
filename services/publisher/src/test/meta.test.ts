import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ctx, forbidNetwork, mockFetch, output, STORY_URL, video, withEnv } from "./helpers.js";
import { getPublisher, PublishError, verifyMetaSignature, verifyWhatsAppWebhook } from "../index.js";

const G = "https://graph.facebook.com/v23.0";

// ---------------- Instagram ----------------
const ig = getPublisher("instagram");
const IG = { IG_USER_ID: "17841", META_PAGE_ACCESS_TOKEN: "page-tok" };
const reel = (payload: Record<string, unknown> = {}) =>
  output({
    id: "ig-en",
    kind: "ig_reel",
    channel: "instagram",
    payload: { caption: "Metro fares up 20%. AI-generated presenter.", hashtags: ["#metro", "OpenLens"], videoOutputId: "video-en-916", ...payload },
  });

test("instagram dry_run: REELS container with public video_url and hashtags appended", async () => {
  const net = forbidNetwork();
  try {
    await withEnv({}, async () => {
      const pub = await ig.publish(reel(), ctx(), { mode: "dry_run" });
      assert.equal(pub.status, "published", pub.error ?? "");
      const create = (pub.response!.requests as any[])[0];
      assert.equal(create.body.media_type, "REELS");
      assert.equal(create.body.video_url, "https://storage.test/assets/sample-metro-fare/video-en-916.mp4");
      assert.equal(create.body.caption, "Metro fares up 20%. AI-generated presenter.\n\n#metro #OpenLens");
      assert.ok((pub.response!.warnings as string[]).some((w) => /story link/.test(w)));
    });
  } finally {
    net.restore();
  }
});

test("instagram validation: Reel aspect + duration, public URL, disclosure, carousel images", async () => {
  await withEnv({}, async () => {
    const r = await ig.validate(reel({ caption: "no disclosure" }), ctx([video("video-en-916", { aspect: "16:9", durationSeconds: 120 })]));
    assert.ok(r.errors.some((e) => /9:16/.test(e)));
    assert.ok(r.errors.some((e) => /outside 5-90s/.test(e)));
    assert.ok(r.errors.some((e) => /AI disclosure/.test(e)));
    const local = ctx(undefined, { resolveAsset: async () => "/tmp/video.mp4" });
    assert.ok((await ig.validate(reel(), local)).errors.some((e) => /public https URL/.test(e)));
    const carousel = output({
      id: "car",
      kind: "carousel",
      channel: "instagram",
      payload: { caption: "AI-generated summary", slides: [1, 2, 3].map((i) => ({ heading: `h${i}`, body: "b", claimIds: [] })) },
    });
    assert.ok((await ig.validate(carousel, ctx())).errors.some((e) => /slides 1, 2, 3 have no rendered imageUrl/.test(e)));
  });
});

test("instagram live: create container, poll until FINISHED, media_publish, permalink", async () => {
  let polls = 0;
  const m = mockFetch((c) => {
    if (c.method === "POST" && c.url === `${G}/17841/media`) return { json: { id: "cont1" } };
    if (c.url.startsWith(`${G}/cont1?fields=status_code`)) return { json: { status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" } };
    if (c.url === `${G}/17841/media_publish`) return { json: { id: "media9" } };
    if (c.url.startsWith(`${G}/media9?fields=permalink`)) return { json: { permalink: "https://www.instagram.com/reel/abc/" } };
    if (c.url === `${G}/media9/comments`) return { json: { id: "comment1" } };
    throw new Error(`unexpected ${c.method} ${c.url}`);
  });
  try {
    await withEnv(IG, async () => {
      const pub = await ig.publish(reel(), ctx(), { mode: "live" });
      assert.equal(pub.status, "published", pub.error ?? "");
      assert.equal(pub.externalId, "media9");
      assert.equal(pub.url, "https://www.instagram.com/reel/abc/");
      assert.equal(m.calls[0]!.headers.authorization, "Bearer page-tok");
      assert.equal(m.calls[0]!.json.video_url, "https://storage.test/assets/sample-metro-fare/video-en-916.mp4");
      assert.equal(polls, 2);
      const publish = m.calls.find((c) => c.url.endsWith("/media_publish"))!;
      assert.deepEqual(publish.json, { creation_id: "cont1" });

      const corr = await ig.update(pub, reel(), ctx());
      assert.equal(corr.status, "corrected");
      assert.equal(m.calls[m.calls.length - 1]!.url, `${G}/media9/comments`);
      const ret = await ig.retract(corr, ctx());
      assert.equal(ret.status, "needs_correction");
      assert.match(ret.error!, /cannot delete/);
    });
  } finally {
    m.restore();
  }
});

test("instagram: each language posts to its own account (IG_USER_ID_<LANG> / META_PAGE_ACCESS_TOKEN_<LANG>)", async () => {
  const m = mockFetch((c) => {
    if (c.method === "POST" && c.url.endsWith("/media")) return { json: { id: "cont1" } };
    if (c.url.startsWith(`${G}/cont1?fields=status_code`)) return { json: { status_code: "FINISHED" } };
    if (c.url.endsWith("/media_publish")) return { json: { id: "media9" } };
    if (c.url.startsWith(`${G}/media9?fields=permalink`)) return { json: { permalink: "https://www.instagram.com/reel/abc/" } };
    throw new Error(`unexpected ${c.method} ${c.url}`);
  });
  const LANGS = { IG_USER_ID_EN: "111", META_PAGE_ACCESS_TOKEN_EN: "tok-en", IG_USER_ID_JA: "222", META_PAGE_ACCESS_TOKEN_JA: "tok-ja" };
  try {
    await withEnv(LANGS, async () => {
      assert.equal(ig.status().live, true);
      const ja = await ig.publish({ ...reel(), lang: "ja" }, ctx(), { mode: "live" });
      assert.equal(ja.status, "published", ja.error ?? "");
      assert.equal(m.calls[0]!.url, `${G}/222/media`);
      assert.equal(m.calls[0]!.headers.authorization, "Bearer tok-ja");
      const en = await ig.publish({ ...reel(), lang: "en" }, ctx(), { mode: "live" });
      assert.equal(en.status, "published", en.error ?? "");
      assert.ok(m.calls.some((c) => c.url === `${G}/111/media` && c.headers.authorization === "Bearer tok-en"));
    });
    // a language with no account and no default is refused for live publishing
    await withEnv({ IG_USER_ID_EN: "111", META_PAGE_ACCESS_TOKEN_EN: "tok-en" }, async () => {
      await assert.rejects(ig.publish({ ...reel(), lang: "ja" }, ctx(), { mode: "live" }), /IG_USER_ID_JA|no Instagram account/);
    });
  } finally {
    m.restore();
  }
});

test("instagram live: container ERROR becomes a failed publication", async () => {
  const m = mockFetch((c) => (c.url.includes("status_code") ? { json: { status_code: "ERROR", status: "Error: video too short" } } : { json: { id: "cont1" } }));
  try {
    await withEnv(IG, async () => {
      const pub = await ig.publish(reel(), ctx(), { mode: "live" });
      assert.equal(pub.status, "failed");
      assert.match(pub.error!, /ERROR Error: video too short/);
    });
  } finally {
    m.restore();
  }
});

// ---------------- Facebook ----------------
const fb = getPublisher("facebook");
const FB = { FB_PAGE_ID: "page1", META_PAGE_ACCESS_TOKEN: "page-tok" };
const post = (payload: Record<string, unknown> = {}) =>
  output({
    id: "fb-en",
    kind: "fb_post",
    channel: "facebook",
    payload: { message: "Metro fares will rise 20% from 1 January. Summary by an AI-generated presenter.", link: STORY_URL, ...payload },
  });

test("facebook validation + live refusal", async () => {
  await withEnv({}, async () => {
    const r = await fb.validate(post({ message: "no disclosure", link: "http://x" }), ctx());
    assert.ok(r.errors.some((e) => /https/.test(e)));
    assert.ok(r.errors.some((e) => /link to the story/.test(e)));
    assert.ok(r.errors.some((e) => /AI disclosure/.test(e)));
    await assert.rejects(fb.publish(post(), ctx(), { mode: "live" }), (e: unknown) => e instanceof PublishError && e.code === "not_live" && /FB_PAGE_ID/.test(e.message));
  });
});

test("facebook live feed post, correction edit, retract delete", async () => {
  const m = mockFetch((c) => {
    if (c.url === `${G}/page1/feed`) return { json: { id: "page1_555" } };
    if (c.url === `${G}/page1_555` && c.method === "POST") return { json: { success: true } };
    if (c.url === `${G}/page1_555` && c.method === "DELETE") return { json: { success: true } };
    throw new Error(`unexpected ${c.method} ${c.url}`);
  });
  try {
    await withEnv(FB, async () => {
      const pub = await fb.publish(post(), ctx(), { mode: "live" });
      assert.equal(pub.status, "published", pub.error ?? "");
      assert.equal(pub.url, "https://www.facebook.com/page1_555");
      assert.deepEqual(m.calls[0]!.json, { message: post().payload.message, link: STORY_URL });
      const corr = await fb.update(pub, post(), ctx(undefined, { correctionNote: "Vote was 6-3." }));
      assert.equal(corr.status, "corrected");
      assert.match(m.calls[1]!.json.message, /\n\nCorrection \(.*\): Vote was 6-3\./);
      const ret = await fb.retract(corr, ctx());
      assert.equal(ret.status, "retracted");
      assert.equal(m.calls[2]!.method, "DELETE");
    });
  } finally {
    m.restore();
  }
});

test("facebook video goes to graph-video /videos with file_url; scheduling", async () => {
  const net = forbidNetwork();
  try {
    await withEnv({}, async () => {
      const at = new Date(Date.now() + 3_600_000).toISOString();
      const pub = await fb.publish(post({ videoOutputId: "video-en-916" }), ctx(), { mode: "dry_run", scheduleAt: at });
      const req = (pub.response!.requests as any[])[0];
      assert.equal(req.url, "https://graph-video.facebook.com/v23.0/{FB_PAGE_ID}/videos");
      assert.equal(req.body.file_url, "https://storage.test/assets/sample-metro-fare/video-en-916.mp4");
      assert.equal(req.body.published, false);
      assert.equal(req.body.scheduled_publish_time, Math.floor(Date.parse(at) / 1000));
      const tooSoon = await fb.publish(post(), ctx(), { mode: "dry_run", scheduleAt: new Date(Date.now() + 60_000).toISOString() });
      assert.equal(tooSoon.status, "failed");
      assert.match(tooSoon.error!, /at least 10 min/);
    });
  } finally {
    net.restore();
  }
  const m = mockFetch(() => ({ json: { id: "v77" } }));
  try {
    await withEnv(FB, async () => {
      const pub = await fb.publish(post({ videoOutputId: "video-en-916" }), ctx(), { mode: "live" });
      assert.equal(m.calls[0]!.url, "https://graph-video.facebook.com/v23.0/page1/videos");
      assert.match(m.calls[0]!.json.description, new RegExp(`${STORY_URL}$`));
      assert.equal(pub.url, "https://www.facebook.com/page1/videos/v77");
    });
  } finally {
    m.restore();
  }
});

// ---------------- WhatsApp ----------------
const wa = getPublisher("whatsapp");
const WA = { WA_PHONE_NUMBER_ID: "pn1", WA_ACCESS_TOKEN: "wa-tok", WA_TEMPLATES: JSON.stringify({ daily_digest_te: { bodyParams: 1, urlButton: true, urlPrefix: "https://openlens.app/story/", disclosureInTemplate: true } }) };
const digest = (payload: Record<string, unknown> = {}) =>
  output({
    id: "wa-te",
    kind: "wa_digest",
    channel: "whatsapp",
    lang: "te",
    payload: { templateName: "daily_digest_te", params: ["మెట్రో ఛార్జీలు 20% పెంపు"], previewText: "నేటి వార్త", link: STORY_URL, ...payload },
  });

test("whatsapp dry_run: template message with masked recipient, button URL suffix", async () => {
  const net = forbidNetwork();
  try {
    await withEnv({ WA_TEMPLATES: WA.WA_TEMPLATES }, async () => {
      const pub = await wa.publish(digest(), ctx(), { mode: "dry_run", recipients: ["+91 98765 43210"] });
      assert.equal(pub.status, "published", pub.error ?? "");
      const body = (pub.response!.requests as any[])[0].body;
      assert.equal(body.to, "********3210");
      assert.equal(body.type, "template");
      assert.deepEqual(body.template.language, { code: "te" });
      assert.deepEqual(body.template.components[0], { type: "body", parameters: [{ type: "text", text: "మెట్రో ఛార్జీలు 20% పెంపు" }] });
      assert.deepEqual(body.template.components[1].parameters, [{ type: "text", text: "sample-metro-fare" }]);
      assert.ok(!JSON.stringify(pub).includes("9876543210"));
    });
  } finally {
    net.restore();
  }
});

test("whatsapp validation: param count, newlines, recipients required for live", async () => {
  await withEnv(WA, async () => {
    const r = await wa.validate(digest({ params: ["a\nb", "c"] }), ctx());
    assert.ok(r.errors.some((e) => /expects 1 body params, got 2/.test(e)));
    assert.ok(r.errors.some((e) => /newline/.test(e)));
    await assert.rejects(wa.publish(digest(), ctx(), { mode: "live" }), (e: unknown) => e instanceof PublishError && e.code === "validation_failed" && /recipients/.test(e.message));
  });
  await withEnv({}, async () => {
    await assert.rejects(wa.publish(digest(), ctx(), { mode: "live", recipients: ["919876543210"] }), (e: unknown) => e instanceof PublishError && e.code === "not_live");
  });
});

test("whatsapp live: one template send per recipient, partial failure recorded", async () => {
  const m = mockFetch((c) => (c.json.to === "919000000002" ? { status: 400, json: { error: { message: "Recipient not in allowed list", code: 131030 } } } : { json: { messages: [{ id: `wamid.${c.json.to}` }] } }));
  try {
    await withEnv(WA, async () => {
      const pub = await wa.publish(digest(), ctx(), { mode: "live", recipients: ["919000000001", "919000000002", "919000000001"] });
      assert.equal(m.calls.length, 2); // deduped
      assert.equal(m.calls[0]!.url, `${G}/pn1/messages`);
      assert.equal(m.calls[0]!.headers.authorization, "Bearer wa-tok");
      assert.equal(pub.status, "published");
      assert.equal(pub.externalId, "wamid.919000000001");
      assert.equal(pub.response!.sent, 1);
      assert.equal(pub.response!.failed, 1);
      assert.match(pub.error!, /1\/2 WhatsApp sends failed/);
      const upd = await wa.update(pub, digest(), ctx());
      assert.equal(upd.status, "needs_correction");
    });
  } finally {
    m.restore();
  }
});

test("whatsapp webhook verification and signature check", async () => {
  await withEnv({ WA_WEBHOOK_VERIFY_TOKEN: "verify-me", META_APP_SECRET: "appsecret" }, () => {
    assert.deepEqual(verifyWhatsAppWebhook({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" }), { status: 200, body: "42" });
    assert.equal(verifyWhatsAppWebhook({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42" }).status, 403);
    assert.equal(verifyWhatsAppWebhook({}).status, 400);
    const raw = '{"entry":[]}';
    const sig = `sha256=${createHmac("sha256", "appsecret").update(raw).digest("hex")}`;
    assert.equal(verifyMetaSignature(raw, sig), true);
    assert.equal(verifyMetaSignature(raw, "sha256=00"), false);
  });
  await withEnv({}, () => assert.equal(verifyWhatsAppWebhook({ "hub.mode": "subscribe" }).status, 503));
});
