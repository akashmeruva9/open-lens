import { CHANNEL_LIMITS } from "@openlens/config";
import { FbPostPayload, type OutputRecord, type Publication } from "@openlens/schemas";
import { definePublisher, runFollowUp } from "../base.js";
import { env, graphVersion, statusFromMissing } from "../env.js";
import type { PublishContext } from "../types.js";
import { PublishError } from "../types.js";
import { appendCorrection, checkSchedule, correctionNote, hasAiDisclosure, isHttpsUrl, resolveVideo, zodMessage } from "../util.js";
import { graph } from "./meta.js";

const L = CHANNEL_LIMITS.facebook;
const TOKEN = "META_PAGE_ACCESS_TOKEN";
const status = () => statusFromMissing(["FB_PAGE_ID", TOKEN]);
const page = () => env("FB_PAGE_ID") ?? "{FB_PAGE_ID}";
const videoBase = () => `https://graph-video.facebook.com/${graphVersion()}`;
const MIN_SCHEDULE_MS = 10 * 60_000;
const MAX_SCHEDULE_MS = 30 * 86_400_000;

interface FbState {
  kind: "feed" | "video";
  path: string;
  body: Record<string, unknown>;
}

function scheduleFields(scheduleAt?: string): Record<string, unknown> {
  return scheduleAt ? { published: false, scheduled_publish_time: Math.floor(Date.parse(scheduleAt) / 1000) } : {};
}

export const facebookPublisher = definePublisher<FbState>({
  channel: "facebook",
  kinds: ["fb_post"],
  status,

  async validate(output, ctx, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const p = FbPostPayload.safeParse(output.payload);
    if (!p.success) return { errors: [`invalid fb_post payload: ${zodMessage(p.error)}`], warnings };
    const { message, link, videoOutputId } = p.data;
    if (!message.trim()) errors.push("message is empty");
    if (message.length > L.postMax) errors.push(`message is ${message.length} chars (max ${L.postMax})`);
    if (!isHttpsUrl(link)) errors.push(`link must be an https URL (got "${link}")`);
    if (!link.includes(ctx.storyUrl) && !message.includes(ctx.storyUrl)) errors.push(`post must link to the story (${ctx.storyUrl})`);
    if (output.aiDisclosure && !hasAiDisclosure(message)) errors.push("message must contain an AI disclosure (aiDisclosure is set)");
    if (videoOutputId) {
      const v = await resolveVideo(output, ctx, videoOutputId);
      if ("error" in v) errors.push(v.error);
      else if (!isHttpsUrl(await ctx.resolveAsset(v.video.mp4Url, { public: true }))) errors.push("video must resolve to a public https URL (file_url)");
    }
    const sched = checkSchedule(opts?.scheduleAt, MIN_SCHEDULE_MS, MAX_SCHEDULE_MS);
    if (sched) errors.push(`Facebook: ${sched}`);
    return { errors, warnings };
  },

  async prepare(output, ctx, opts) {
    const p = FbPostPayload.parse(output.payload);
    let state: FbState;
    if (p.videoOutputId) {
      const v = await resolveVideo(output, ctx, p.videoOutputId);
      if ("error" in v) throw new PublishError("validation_failed", v.error);
      const fileUrl = await ctx.resolveAsset(v.video.mp4Url, { public: true });
      const description = p.message.includes(p.link) ? p.message : `${p.message}\n\n${p.link}`;
      state = { kind: "video", path: `${videoBase()}/${page()}/videos`, body: { file_url: fileUrl, description, ...scheduleFields(opts.scheduleAt) } };
    } else {
      state = { kind: "feed", path: `/${page()}/feed`, body: { message: p.message, link: p.link, ...scheduleFields(opts.scheduleAt) } };
    }
    const url = state.path.startsWith("/") ? `graph.facebook.com/${graphVersion()}${state.path}` : state.path;
    return { requests: [{ step: state.kind === "video" ? "page videos" : "page feed", method: "POST", url, auth: `Bearer ${TOKEN}`, body: state.body }], state };
  },

  async execute(prep) {
    const s = prep.state;
    const path = s.path.replace("{FB_PAGE_ID}", env("FB_PAGE_ID")!);
    const res = await graph(TOKEN, "POST", path, `facebook.${s.kind}`, { json: s.body, retry5xx: false });
    const id = res.json?.id as string | undefined;
    if (!id) throw new Error(`facebook.${s.kind}: response has no id`);
    const url = s.kind === "video" ? `https://www.facebook.com/${env("FB_PAGE_ID")}/videos/${id}` : `https://www.facebook.com/${id}`;
    return { externalId: id, url, response: { kind: s.kind, id, postId: res.json?.post_id } };
  },

  async update(pub: Publication, output: OutputRecord, ctx: PublishContext) {
    const p = FbPostPayload.safeParse(output.payload);
    if (!p.success) throw new PublishError("bad_request", `invalid fb_post payload: ${zodMessage(p.error)}`);
    const isVideo = pub.response?.kind === "video";
    const text = appendCorrection(isVideo && !p.data.message.includes(p.data.link) ? `${p.data.message}\n\n${p.data.link}` : p.data.message, correctionNote(ctx), L.postMax);
    const body = isVideo ? { description: text } : { message: text };
    const path = `/${pub.externalId}`;
    return runFollowUp({
      pub,
      action: "update",
      channel: "facebook",
      status: status(),
      onSuccess: "corrected",
      ledgerVersion: output.ledgerVersion,
      requests: [{ step: isVideo ? "edit video description" : "edit post message", method: "POST", url: `graph.facebook.com/${graphVersion()}${path}`, body }],
      run: async () => ({ success: (await graph(TOKEN, "POST", path, "facebook.update", { json: body })).json?.success ?? true }),
    });
  },

  async retract(pub: Publication) {
    const path = `/${pub.externalId}`;
    return runFollowUp({
      pub,
      action: "retract",
      channel: "facebook",
      status: status(),
      onSuccess: "retracted",
      requests: [{ step: "delete post", method: "DELETE", url: `graph.facebook.com/${graphVersion()}${path}` }],
      run: async () => ({ success: (await graph(TOKEN, "DELETE", path, "facebook.delete")).json?.success ?? true }),
    });
  },
});
