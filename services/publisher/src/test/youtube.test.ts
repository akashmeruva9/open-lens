import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ctx, forbidNetwork, mockFetch, output, STORY_URL, video, withEnv } from "./helpers.js";
import { getPublisher, PublishError } from "../index.js";
import { clearYoutubeTokenCache } from "../channels/youtube.js";

const yt = getPublisher("youtube");
const CREDS = { YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "csecret", YOUTUBE_REFRESH_TOKEN_REGIONAL: "rt-regional" };

const meta = (payload: Record<string, unknown> = {}) =>
  output({
    id: "yt-te",
    kind: "yt_meta",
    channel: "youtube",
    lang: "te",
    tier: "regional",
    dependsOn: ["video-en-916"],
    payload: {
      tier: "regional",
      title: "మెట్రో ఛార్జీలు 20% పెంపు | OpenLens",
      description: `మూలాలు: ${STORY_URL}\nSources: https://metro.example.gov/order\nAI-generated presenter / narration.`,
      tags: ["metro", "news"],
      containsSyntheticMedia: true,
      videoOutputId: "video-en-916",
      ...payload,
    },
  });

beforeEach(() => clearYoutubeTokenCache());

test("youtube dry_run builds the exact insert request without network", async () => {
  const net = forbidNetwork();
  try {
    await withEnv({}, async () => {
      const pub = await yt.publish(meta(), ctx(), { mode: "dry_run" });
      assert.equal(pub.mode, "dry_run");
      assert.equal(pub.status, "published");
      assert.equal(pub.response!.live, false);
      const reqs = pub.response!.requests as { step: string; url: string; body: any }[];
      const insert = reqs.find((r) => r.step.startsWith("videos.insert (resumable init)"))!;
      assert.match(insert.url, /upload\/youtube\/v3\/videos\?uploadType=resumable&part=snippet,status/);
      assert.equal(insert.body.snippet.defaultLanguage, "te");
      assert.equal(insert.body.snippet.defaultAudioLanguage, "te");
      assert.equal(insert.body.snippet.categoryId, "25");
      assert.equal(insert.body.status.privacyStatus, "private");
      assert.equal(insert.body.status.containsSyntheticMedia, true);
      assert.equal(insert.body.status.selfDeclaredMadeForKids, false);
      assert.ok(reqs.some((r) => r.step === "captions.insert"));
      assert.ok(!JSON.stringify(pub).includes("rt-regional"));
    });
  } finally {
    net.restore();
  }
});

test("youtube validation: disclosure, synthetic flag, story link, missing video", async () => {
  await withEnv({}, async () => {
    const r1 = await yt.validate(meta({ description: "Sources: none", containsSyntheticMedia: false }), ctx());
    assert.equal(r1.ok, false);
    assert.ok(r1.errors.some((e) => /containsSyntheticMedia/.test(e)));
    assert.ok(r1.errors.some((e) => /AI disclosure/.test(e)));
    assert.ok(r1.errors.some((e) => /link to the story/.test(e)));
    const r2 = await yt.validate(meta({ videoOutputId: undefined }), ctx([]));
    assert.ok(r2.errors.some((e) => /no rendered video/.test(e)));
    const r3 = await yt.validate(meta({ title: "a <b>" }), ctx());
    assert.ok(r3.errors.some((e) => /'<'/.test(e)));
    // dry_run with invalid output returns a failed publication rather than throwing
    const pub = await yt.publish(meta({ description: "x" }), ctx(), { mode: "dry_run" });
    assert.equal(pub.status, "failed");
    assert.match(pub.error!, /validation failed/);
  });
});

test("youtube live refuses without credentials and for unapproved outputs", async () => {
  await withEnv({}, async () => {
    await assert.rejects(yt.publish(meta(), ctx(), { mode: "live" }), (e: unknown) => e instanceof PublishError && e.code === "not_live" && /YOUTUBE_CLIENT_ID/.test(e.message));
  });
  await withEnv(CREDS, async () => {
    await assert.rejects(yt.publish({ ...meta(), status: "needs_review" }, ctx(), { mode: "live" }), (e: unknown) => e instanceof PublishError && e.code === "not_approved");
  });
});

test("youtube live: token refresh, resumable upload, captions; then correction + retract", async () => {
  const m = mockFetch((c) => {
    if (c.url === "https://oauth2.googleapis.com/token") return { json: { access_token: "at-1", expires_in: 3600 } };
    if (c.url.includes("/upload/youtube/v3/videos?uploadType=resumable")) return { headers: { location: "https://upload.test/session/1" } };
    if (c.url === "https://upload.test/session/1") return { json: { id: "vid123", status: { uploadStatus: "uploaded", privacyStatus: "private" } } };
    if (c.url.includes("/upload/youtube/v3/captions")) return { json: { id: "cap1" } };
    if (c.url.startsWith("https://www.googleapis.com/youtube/v3/videos?part=")) return { json: { id: "vid123", snippet: { title: "t" }, status: { privacyStatus: "private" } } };
    throw new Error(`unexpected ${c.method} ${c.url}`);
  });
  try {
    await withEnv(CREDS, async () => {
      const pub = await yt.publish(meta(), ctx(), { mode: "live" });
      assert.equal(pub.status, "published", pub.error ?? "");
      assert.equal(pub.mode, "live");
      assert.equal(pub.externalId, "vid123");
      assert.equal(pub.url, "https://www.youtube.com/shorts/vid123");
      assert.equal(pub.response!.captionId, "cap1");

      const [tok, init, put, cap] = m.calls;
      assert.equal(tok!.form!.refresh_token, "rt-regional");
      assert.equal(tok!.form!.grant_type, "refresh_token");
      assert.equal(init!.method, "POST");
      assert.equal(init!.headers.authorization, "Bearer at-1");
      assert.equal(init!.headers["x-upload-content-type"], "video/mp4");
      assert.equal(init!.headers["x-upload-content-length"], String(Buffer.from("fake-mp4-bytes").length));
      assert.equal(init!.json.status.containsSyntheticMedia, true);
      assert.equal(init!.json.snippet.title, "మెట్రో ఛార్జీలు 20% పెంపు | OpenLens");
      assert.equal(put!.method, "PUT");
      assert.equal(Buffer.from(put!.body as Uint8Array).toString(), "fake-mp4-bytes");
      assert.match(cap!.headers["content-type"]!, /^multipart\/related; boundary=/);
      const capBody = Buffer.from(cap!.body as Uint8Array).toString();
      assert.match(capBody, /"videoId":"vid123"/);
      assert.match(capBody, /"language":"te"/);
      assert.match(capBody, /WEBVTT/);
      assert.ok(!JSON.stringify(pub).includes("at-1"));

      const n = m.calls.length;
      const corrected = await yt.update(pub, { ...meta(), ledgerVersion: 2 }, ctx(undefined, { correctionNote: "The vote was 6-3, not 7-2." }));
      assert.equal(corrected.status, "corrected");
      assert.equal(corrected.ledgerVersion, 2);
      const upd = m.calls[n]!; // token cached -> first call is the update
      assert.equal(upd.method, "PUT");
      assert.equal(upd.url, "https://www.googleapis.com/youtube/v3/videos?part=snippet");
      assert.equal(upd.json.id, "vid123");
      assert.match(upd.json.snippet.description, /Correction \(\d{4}-\d{2}-\d{2}\): The vote was 6-3, not 7-2\./);
      assert.equal(upd.json.snippet.categoryId, "25");

      const retracted = await yt.retract(corrected, ctx());
      assert.equal(retracted.status, "retracted");
      const ret = m.calls[m.calls.length - 1]!;
      assert.equal(ret.url, "https://www.googleapis.com/youtube/v3/videos?part=status");
      assert.equal(ret.json.status.privacyStatus, "private");
      assert.equal(ret.json.status.containsSyntheticMedia, true);
    });
  } finally {
    m.restore();
  }
});

test("youtube live: upstream error is captured into Publication.error", async () => {
  const m = mockFetch((c) => {
    if (c.url.includes("oauth2")) return { json: { access_token: "at", expires_in: 3600 } };
    return { status: 403, json: { error: { code: 403, message: "The request cannot be completed because you have exceeded your quota." } } };
  });
  try {
    await withEnv(CREDS, async () => {
      const pub = await yt.publish(meta(), ctx(), { mode: "live" });
      assert.equal(pub.status, "failed");
      assert.match(pub.error!, /youtube.videos.insert.init: HTTP 403 .*quota/);
    });
  } finally {
    m.restore();
  }
});

test("youtube scheduleAt sets private + publishAt; dry-run update needs no creds", async () => {
  const net = forbidNetwork();
  try {
    await withEnv({}, async () => {
      const at = new Date(Date.now() + 3_600_000).toISOString();
      const pub = await yt.publish(meta(), ctx([video("video-en-916", { aspect: "16:9", durationSeconds: 200 })]), { mode: "dry_run", scheduleAt: at });
      const insert = (pub.response!.requests as any[]).find((r) => r.step.startsWith("videos.insert (resumable"));
      assert.equal(insert.body.status.publishAt, at);
      assert.equal(insert.body.status.privacyStatus, "private");
      const upd = await yt.update(pub, meta(), ctx());
      assert.equal(upd.status, "corrected");
      assert.equal((upd.response!.corrections as any[])[0].dryRun, true);
    });
  } finally {
    net.restore();
  }
});
