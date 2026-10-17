import { CHANNEL_LIMITS } from "@openlens/config";
import { FbPostPayload, type OutputRecord, type Publication } from "@openlens/schemas";
import { definePublisher, runFollowUp } from "../base.js";
import { env, graphVersion, statusFromMissing } from "../env.js";
import type { PublishContext } from "../types.js";
import { PublishError } from "../types.js";
import { appendCorrection, checkSchedule, correctionNote, hasAiDisclosure, isHttpsUrl, resolveVideo, zodMessage } from "../util.js";
import { graph } from "./meta.js";

const L = CHANNEL_LIMITS.facebook;
const REQUIRED = ["FB_PAGE_ID", "META_PAGE_ACCESS_TOKEN"];

// ---------- credentials ----------
// One Facebook Page per language: FB_PAGE_ID_<LANG> + META_PAGE_ACCESS_TOKEN_<LANG> (e.g. _EN, _JA) win over the plain
// FB_PAGE_ID / META_PAGE_ACCESS_TOKEN, which stay the default Page. Same pattern as Instagram.
const langSuffix = (lang?: string) => (lang ? `_${lang.toUpperCase().replace(/-/g, "_")}` : "");
export const fbPageEnvFor = (lang?: string) => (lang && env(`FB_PAGE_ID${langSuffix(lang)}`) ? `FB_PAGE_ID${langSuffix(lang)}` : "FB_PAGE_ID");
export const fbTokenEnvFor = (lang?: string) => (lang && env(`META_PAGE_ACCESS_TOKEN${langSuffix(lang)}`) ? `META_PAGE_ACCESS_TOKEN${langSuffix(lang)}` : "META_PAGE_ACCESS_TOKEN");
const page = (lang?: string) => env(fbPageEnvFor(lang)) ?? `{${fbPageEnvFor(lang)}}`;
const hasCreds = (lang?: string) => Boolean(env(fbPageEnvFor(lang)) && env(fbTokenEnvFor(lang)));

function status() {
  const base = statusFromMissing(REQUIRED);
  if (base.live) return base;
  const anyLang = Object.keys(process.env).some((n) => {
    const m = /^FB_PAGE_ID_([A-Z0-9_]+)$/.exec(n);
    return m && env(n) && env(`META_PAGE_ACCESS_TOKEN_${m[1]}`);
  });
  return anyLang ? { live: true } : base;
}
const videoBase = () => `https://graph-video.facebook.com/${graphVersion()}`;
const MIN_SCHEDULE_MS = 10 * 60_000;
const MAX_SCHEDULE_MS = 30 * 86_400_000;

interface FbState {
  lang: string;
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
    if (opts?.mode === "live" && !hasCreds(output.lang)) errors.push(`no Facebook Page configured for "${output.lang}" (set ${fbPageEnvFor(output.lang)} and ${fbTokenEnvFor(output.lang)})`);
    if (!p.success) return { errors: [...errors, `invalid fb_post payload: ${zodMessage(p.error)}`], warnings };
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
    const lang = output.lang;
    let state: FbState;
    if (p.videoOutputId) {
      const v = await resolveVideo(output, ctx, p.videoOutputId);
      if ("error" in v) throw new PublishError("validation_failed", v.error);
      const fileUrl = await ctx.resolveAsset(v.video.mp4Url, { public: true });
      const description = p.message.includes(p.link) ? p.message : `${p.message}\n\n${p.link}`;
      state = { lang, kind: "video", path: `${videoBase()}/${page(lang)}/videos`, body: { file_url: fileUrl, description, ...scheduleFields(opts.scheduleAt) } };
    } else {
      state = { lang, kind: "feed", path: `/${page(lang)}/feed`, body: { message: p.message, link: p.link, ...scheduleFields(opts.scheduleAt) } };
    }
    const url = state.path.startsWith("/") ? `graph.facebook.com/${graphVersion()}${state.path}` : state.path;
    return { requests: [{ step: state.kind === "video" ? "page videos" : "page feed", method: "POST", url, auth: `Bearer ${fbTokenEnvFor(lang)}`, body: state.body }], state };
  },

  async execute(prep) {
    const s = prep.state;
    const pageEnv = fbPageEnvFor(s.lang);
    const path = s.path.replace(`{${pageEnv}}`, env(pageEnv)!);
    const res = await graph(fbTokenEnvFor(s.lang), "POST", path, `facebook.${s.kind}`, { json: s.body, retry5xx: false });
    const id = res.json?.id as string | undefined;
    if (!id) throw new Error(`facebook.${s.kind}: response has no id`);
    const url = s.kind === "video" ? `https://www.facebook.com/${env(pageEnv)}/videos/${id}` : `https://www.facebook.com/${id}`;
    return { externalId: id, url, response: { kind: s.kind, id, postId: res.json?.post_id, lang: s.lang } };
  },

  async update(pub: Publication, output: OutputRecord, ctx: PublishContext) {
    const p = FbPostPayload.safeParse(output.payload);
    if (!p.success) throw new PublishError("bad_request", `invalid fb_post payload: ${zodMessage(p.error)}`);
    const isVideo = pub.response?.kind === "video";
    const text = appendCorrection(isVideo && !p.data.message.includes(p.data.link) ? `${p.data.message}\n\n${p.data.link}` : p.data.message, correctionNote(ctx), L.postMax);
    const body = isVideo ? { description: text } : { message: text };
    const path = `/${pub.externalId}`;
    const TOKEN = fbTokenEnvFor(output.lang);
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
    const TOKEN = fbTokenEnvFor(typeof pub.response?.lang === "string" ? pub.response.lang : undefined);
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
