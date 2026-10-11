import { CHANNEL_LIMITS } from "@openlens/config";
import type { OutputRecord, Publication } from "@openlens/schemas";
import { z } from "zod";
import { definePublisher, runFollowUp, type Status } from "../base.js";
import { boolEnv, env, intEnv, missingEnv } from "../env.js";
import { http } from "../http.js";
import { oauth1Header } from "../oauth1.js";
import type { PublishContext, RequestSpec } from "../types.js";
import { PublishError } from "../types.js";
import {
  contentTypeFor,
  correctionNote,
  hasAiDisclosure,
  loadAsset,
  resolveVideo,
  sleep,
  xWeightedLength,
  zodMessage,
  type Video,
} from "../util.js";

const L = CHANNEL_LIMITS.x;
/**
 * Same shape as XThreadPayload but without its naive .max(280) per post: X counts URLs as 23 and
 * CJK/emoji as 2, so length is checked with xWeightedLength in validate() instead.
 */
const XThread = z.object({ posts: z.array(z.string()).min(1), videoOutputId: z.string().optional() });
const OAUTH1_ENV = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
const MAX_VIDEO_SECONDS = 140;
const CHUNK = 4 * 1024 * 1024;

const base = () => env("X_API_BASE") ?? "https://api.x.com";

function authMode(): "oauth1" | "oauth2" | undefined {
  if (missingEnv(OAUTH1_ENV).length === 0) return "oauth1";
  if (env("X_OAUTH2_USER_TOKEN")) return "oauth2";
  return undefined;
}

function status(): Status {
  if (authMode()) return { live: true };
  return { live: false, reason: `missing env: ${OAUTH1_ENV.join(", ")} (OAuth 1.0a) or X_OAUTH2_USER_TOKEN` };
}

function authHeader(method: string, url: string): string {
  if (authMode() === "oauth1") {
    return oauth1Header({
      method,
      url,
      consumerKey: env("X_API_KEY")!,
      consumerSecret: env("X_API_SECRET")!,
      token: env("X_ACCESS_TOKEN")!,
      tokenSecret: env("X_ACCESS_TOKEN_SECRET")!,
    });
  }
  const t = env("X_OAUTH2_USER_TOKEN");
  if (!t) throw new PublishError("not_live", "no X credentials configured");
  return `Bearer ${t}`;
}

function authDescriptor(): string {
  const m = authMode();
  return m === "oauth1" ? "OAuth 1.0a user context (X_API_KEY/X_ACCESS_TOKEN)" : m === "oauth2" ? "OAuth 2.0 user token (X_OAUTH2_USER_TOKEN)" : "OAuth 1.0a or OAuth 2.0 user context (not configured)";
}

async function xCall(method: string, url: string, label: string, init: { json?: unknown; body?: FormData; retry5xx?: boolean } = {}) {
  return http({ method, url, label, headers: { Authorization: authHeader(method, url) }, json: init.json, body: init.body, retry5xx: init.retry5xx });
}

function postUrl(id: string): string {
  return `https://x.com/${env("X_USERNAME") ?? "i"}/status/${id}`;
}

interface XState {
  posts: { text: string }[];
  video?: Video;
}

async function uploadVideo(video: Video, ctx: PublishContext): Promise<string> {
  const bytes = await loadAsset(await ctx.resolveAsset(video.mp4Url, { public: false }), "x.video");
  const init = await xCall("POST", `${base()}/2/media/upload/initialize`, "x.media.initialize", {
    json: { media_type: contentTypeFor(video.mp4Url), total_bytes: bytes.byteLength, media_category: "tweet_video" },
  });
  const mediaId = init.json?.data?.id as string | undefined;
  if (!mediaId) throw new Error("x.media.initialize: no media id");
  for (let i = 0, seg = 0; i < bytes.byteLength; i += CHUNK, seg++) {
    const fd = new FormData();
    fd.append("segment_index", String(seg));
    fd.append("media", new Blob([new Uint8Array(bytes.subarray(i, i + CHUNK))], { type: "application/octet-stream" }));
    await xCall("POST", `${base()}/2/media/upload/${mediaId}/append`, "x.media.append", { body: fd });
  }
  const fin = await xCall("POST", `${base()}/2/media/upload/${mediaId}/finalize`, "x.media.finalize");
  let info = fin.json?.data?.processing_info as { state?: string; check_after_secs?: number; error?: { message?: string } } | undefined;
  const deadline = Date.now() + intEnv("X_MEDIA_TIMEOUT_MS", 120_000);
  while (info && info.state !== "succeeded") {
    if (info.state === "failed") throw new Error(`x.media: processing failed ${info.error?.message ?? ""}`.trim());
    if (Date.now() > deadline) throw new Error("x.media: processing timed out");
    await sleep(Math.min((info.check_after_secs ?? 1) * 1000, 10_000));
    const st = await xCall("GET", `${base()}/2/media/upload?command=STATUS&media_id=${mediaId}`, "x.media.status");
    info = st.json?.data?.processing_info;
  }
  return mediaId;
}

export const xPublisher = definePublisher<XState>({
  channel: "x",
  kinds: ["x_thread"],
  status,

  async validate(output, ctx) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const posts = (output.payload as { posts?: unknown }).posts;
    // Validate lengths with weighted counting before the schema's naive .max(280).
    if (Array.isArray(posts)) {
      posts.forEach((p, i) => {
        if (typeof p !== "string") return;
        const n = xWeightedLength(p);
        if (n > L.maxChars) errors.push(`post ${i + 1} is ${n} weighted chars (max ${L.maxChars}; URLs count 23)`);
        if (!p.trim()) errors.push(`post ${i + 1} is empty`);
      });
      if (posts.length > L.maxThreadPosts) errors.push(`thread has ${posts.length} posts (max ${L.maxThreadPosts})`);
    }
    const parsed = XThread.safeParse(output.payload);
    if (!parsed.success) {
      if (!errors.length) errors.push(`invalid x_thread payload: ${zodMessage(parsed.error)}`);
      return { errors, warnings };
    }
    const all = parsed.data.posts.join("\n");
    if (!all.includes(ctx.storyUrl)) errors.push(`thread must link to the story (${ctx.storyUrl})`);
    if (output.aiDisclosure && !hasAiDisclosure(all)) errors.push("thread must contain an AI disclosure (aiDisclosure is set)");
    if (parsed.data.videoOutputId) {
      if (!boolEnv("X_MEDIA_UPLOAD")) warnings.push("X_MEDIA_UPLOAD is off: the video will not be attached (text + link only)");
      else {
        const v = await resolveVideo(output, ctx, parsed.data.videoOutputId);
        if ("error" in v) errors.push(v.error);
        else if (v.video.durationSeconds > MAX_VIDEO_SECONDS) errors.push(`video is ${v.video.durationSeconds}s (X max ${MAX_VIDEO_SECONDS}s)`);
      }
    }
    return { errors, warnings };
  },

  async prepare(output, ctx, opts) {
    if (opts.scheduleAt) throw new PublishError("unsupported", "X has no native scheduling API; schedule the publish job (Cloud Tasks) instead");
    const payload = XThread.parse(output.payload);
    let video: Video | undefined;
    if (payload.videoOutputId && boolEnv("X_MEDIA_UPLOAD")) {
      const v = await resolveVideo(output, ctx, payload.videoOutputId);
      if ("error" in v) throw new PublishError("validation_failed", v.error);
      video = v.video;
    }
    const auth = authDescriptor();
    const requests: RequestSpec[] = [];
    if (video) {
      requests.push(
        { step: "media.initialize", method: "POST", url: `${base()}/2/media/upload/initialize`, auth, body: { media_type: contentTypeFor(video.mp4Url), total_bytes: "<file size>", media_category: "tweet_video" } },
        { step: "media.append (4MB chunks)", method: "POST", url: `${base()}/2/media/upload/{{media_id}}/append`, auth, body: `<multipart ${video.mp4Url}>` },
        { step: "media.finalize (+ STATUS polling)", method: "POST", url: `${base()}/2/media/upload/{{media_id}}/finalize`, auth },
      );
    }
    payload.posts.forEach((text, i) => {
      requests.push({
        step: `tweets.create ${i + 1}/${payload.posts.length}`,
        method: "POST",
        url: `${base()}/2/tweets`,
        auth,
        body: {
          text,
          ...(i === 0 && video ? { media: { media_ids: ["{{media_id}}"] } } : {}),
          ...(i > 0 ? { reply: { in_reply_to_tweet_id: `{{post_${i}_id}}` } } : {}),
        },
      });
    });
    return { requests, state: { posts: payload.posts.map((text) => ({ text })), video } };
  },

  async execute(prep, _output, ctx) {
    const mediaId = prep.state.video ? await uploadVideo(prep.state.video, ctx) : undefined;
    const ids: string[] = [];
    for (let i = 0; i < prep.state.posts.length; i++) {
      const body = {
        text: prep.state.posts[i]!.text,
        ...(i === 0 && mediaId ? { media: { media_ids: [mediaId] } } : {}),
        ...(i > 0 ? { reply: { in_reply_to_tweet_id: ids[i - 1] } } : {}),
      };
      try {
        // Never retry 5xx on create: X may have posted it, and a retry would duplicate the post.
        const res = await xCall("POST", `${base()}/2/tweets`, "x.tweets.create", { json: body, retry5xx: false });
        const id = res.json?.data?.id as string | undefined;
        if (!id) throw new Error("x.tweets.create: response has no id");
        ids.push(id);
      } catch (err) {
        if (ids.length === 0) throw err;
        // Partial thread: report what exists so an editor can finish or delete it.
        return {
          status: "failed",
          externalId: ids[0],
          url: postUrl(ids[0]!),
          error: `thread stopped at post ${i + 1}/${prep.state.posts.length}: ${err instanceof Error ? err.message : String(err)}`,
          response: { postIds: ids, mediaId, partial: true },
        };
      }
    }
    return { externalId: ids[0], url: postUrl(ids[0]!), response: { postIds: ids, mediaId } };
  },

  /** X posts can't be edited via API: reply to the thread with a correction. */
  async update(pub: Publication, output: OutputRecord, ctx: PublishContext) {
    const text = correctionNote(ctx);
    const replyTo = lastPostId(pub) ?? pub.externalId;
    const body = { text: xWeightedLength(text) > L.maxChars ? `Correction: details at ${ctx.storyUrl}` : text, reply: { in_reply_to_tweet_id: replyTo } };
    const url = `${base()}/2/tweets`;
    return runFollowUp({
      pub,
      action: "update",
      channel: "x",
      status: status(),
      onSuccess: "corrected",
      ledgerVersion: output.ledgerVersion,
      requests: [{ step: "tweets.create (correction reply)", method: "POST", url, body }],
      run: async () => {
        const res = await xCall("POST", url, "x.tweets.correction", { json: body, retry5xx: false });
        return { correctionPostId: res.json?.data?.id };
      },
    });
  },

  async retract(pub: Publication) {
    const ids = postIds(pub);
    const requests = ids.map((id) => ({ step: "tweets.delete", method: "DELETE", url: `${base()}/2/tweets/${id}` }));
    return runFollowUp({
      pub,
      action: "retract",
      channel: "x",
      status: status(),
      onSuccess: "retracted",
      requests,
      run: async () => {
        const deleted: string[] = [];
        for (const r of [...requests].reverse()) {
          await xCall("DELETE", r.url, "x.tweets.delete");
          deleted.push(r.url.split("/").pop()!);
        }
        return { deleted };
      },
    });
  },
});

function postIds(pub: Publication): string[] {
  const ids = pub.response?.postIds;
  if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) return ids as string[];
  return pub.externalId ? [pub.externalId] : [];
}

function lastPostId(pub: Publication): string | undefined {
  const ids = postIds(pub);
  return ids[ids.length - 1];
}
