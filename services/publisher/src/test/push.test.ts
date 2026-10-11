import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mockFetch, withEnv } from "./helpers.js";
import { sendPush, setPushTokenProvider } from "../index.js";

afterEach(() => setPushTokenProvider(undefined));

test("sendPush is a no-op with a reason when FCM is unconfigured", async () => {
  await withEnv({}, async () => {
    const r = await sendPush({ topic: "story-te", title: "t", body: "b" });
    assert.deepEqual(r, { sent: false, reason: "FCM_PROJECT_ID not set; push disabled" });
  });
});

test("sendPush posts an FCM v1 topic message", async () => {
  setPushTokenProvider(async () => "fcm-at");
  const m = mockFetch(() => ({ json: { name: "projects/p/messages/1" } }));
  try {
    await withEnv({ FCM_PROJECT_ID: "openlens-demo" }, async () => {
      const r = await sendPush({ topic: "/topics/region-ap", title: "Correction", body: "Vote was 6-3", data: { storyId: "s1", url: "https://openlens.app/story/s1" } });
      assert.deepEqual(r, { sent: true });
      const c = m.calls[0]!;
      assert.equal(c.url, "https://fcm.googleapis.com/v1/projects/openlens-demo/messages:send");
      assert.equal(c.headers.authorization, "Bearer fcm-at");
      assert.equal(c.json.message.topic, "region-ap");
      assert.deepEqual(c.json.message.notification, { title: "Correction", body: "Vote was 6-3" });
      assert.equal(c.json.message.data.storyId, "s1");
    });
  } finally {
    m.restore();
  }
});

test("sendPush never throws: invalid topic and upstream errors return reasons", async () => {
  setPushTokenProvider(async () => "fcm-at");
  const m = mockFetch(() => ({ status: 403, json: { error: { message: "SenderId mismatch" } } }));
  try {
    await withEnv({ FCM_PROJECT_ID: "p" }, async () => {
      assert.match((await sendPush({ topic: "bad topic!", title: "t", body: "b" })).reason!, /invalid FCM topic/);
      const r = await sendPush({ topic: "ok", title: "t", body: "b" });
      assert.equal(r.sent, false);
      assert.match(r.reason!, /fcm.send: HTTP 403 SenderId mismatch/);
    });
  } finally {
    m.restore();
  }
});
