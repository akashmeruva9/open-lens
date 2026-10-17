import { CHANNEL_LIMITS } from "@openlens/config";
import { YtMetaPayload, type OutputRecord, type Publication, type Tier } from "@openlens/schemas";
import { z } from "zod";
import { definePublisher, runFollowUp, type Status } from "../base.js";
import { boolEnv, env, missingEnv } from "../env.js";
import { formatError, http } from "../http.js";
import type { PublishContext, RequestSpec } from "../types.js";
import { PublishError } from "../types.js";
import {
  appendCorrection,
  checkSchedule,
  contentTypeFor,
  correctionNote,
  hasAiDisclosure,
  loadAsset,
  resolveVideo,
  zodMessage,
  type Video,
} from "../util.js";

const L = CHANNEL_LIMITS.youtube;
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Extension (not yet in YtMetaPayload): localized title/description keyed by BCP-47 language. */
const Localizations = z.record(z.string(), z.object({ title: z.string().max(100), description: z.string().max(5000) }));

type YtMeta = z.infer<typeof YtMetaPayload>;

// ---------- credentials ----------
const TIER_ENV: Record<Tier, string> = {
  regional: "YOUTUBE_REFRESH_TOKEN_REGIONAL",
  national: "YOUTUBE_REFRESH_TOKEN_NATIONAL",
  international: "YOUTUBE_REFRESH_TOKEN_INTERNATIONAL",
};

/** YOUTUBE_REFRESH_TOKEN_<LANG> env name, e.g. zh-Hant -> YOUTUBE_REFRESH_TOKEN_ZH_HANT. */
export const langTokenEnv = (lang: string) => `YOUTUBE_REFRESH_TOKEN_${lang.toUpperCase().replace(/-/g, "_")}`;

/** Refresh-token env var for a channel: per-language channel first, then per-tier, then the default. */
export function refreshTokenEnvFor(tier: Tier | undefined, lang?: string): string | undefined {
  if (lang && env(langTokenEnv(lang))) return langTokenEnv(lang);
  if (tier && env(TIER_ENV[tier])) return TIER_ENV[tier];
  return env("YOUTUBE_REFRESH_TOKEN") ? "YOUTUBE_REFRESH_TOKEN" : undefined;
}

function status(tier?: Tier, lang?: string): Status {
  const m = missingEnv(["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]);
  const anyToken = ["YOUTUBE_REFRESH_TOKEN", ...Object.values(TIER_ENV)].some((n) => env(n)) || Object.keys(process.env).some((n) => /^YOUTUBE_REFRESH_TOKEN_[A-Z0-9_]+$/.test(n) && env(n));
  const hasToken = tier || lang ? !!refreshTokenEnvFor(tier, lang) : anyToken;
  if (!hasToken) m.push(tier ? `YOUTUBE_REFRESH_TOKEN (or ${TIER_ENV[tier]})` : "YOUTUBE_REFRESH_TOKEN (or YOUTUBE_REFRESH_TOKEN_<TIER>)");
  return m.length ? { live: false, reason: `missing env: ${m.join(", ")}` } : { live: true };
}

const tokenCache = new Map<string, { token: string; exp: number }>();
export function clearYoutubeTokenCache(): void {
  tokenCache.clear();
}

async function accessToken(tier: Tier | undefined, lang?: string): Promise<string> {
  const envName = refreshTokenEnvFor(tier, lang);
  if (!envName) throw new PublishError("not_live", "no YouTube refresh token configured");
  const cached = tokenCache.get(envName);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await http({
    method: "POST",
    url: GOOGLE_TOKEN_URL,
    label: "youtube.oauth.refresh",
    form: {
      client_id: env("YOUTUBE_CLIENT_ID")!,
      client_secret: env("YOUTUBE_CLIENT_SECRET")!,
      refresh_token: env(envName)!,
      grant_type: "refresh_token",
    },
  });
  const token = res.json?.access_token as string | undefined;
  if (!token) throw new Error("youtube.oauth.refresh: no access_token in response");
  tokenCache.set(envName, { token, exp: Date.now() + Number(res.json.expires_in ?? 3600) * 1000 });
  return token;
}

// ---------- request builders ----------
function privacyStatus(): "private" | "unlisted" | "public" {
  const v = env("YOUTUBE_PRIVACY_STATUS");
  return v === "public" || v === "unlisted" ? v : "private";
}

function snippet(meta: YtMeta, output: OutputRecord, description = meta.description) {
  return {
    title: meta.title,
    description,
    tags: meta.tags,
    categoryId: env("YOUTUBE_CATEGORY_ID") ?? "25", // News & Politics
    defaultLanguage: output.lang,
    defaultAudioLanguage: output.lang,
  };
}

function localizationsOf(output: OutputRecord) {
  const parsed = Localizations.safeParse(output.payload.localizations);
  return parsed.success && Object.keys(parsed.data).length ? parsed.data : undefined;
}

interface YtState {
  tier?: Tier;
  lang?: string;
  video: Video;
  insertUrl: string;
  insertBody: Record<string, unknown>;
  captions?: { url: string; snippet: Record<string, unknown>; asset: string };
  thumbnail?: { asset: string };
}

/** Tags: YouTube caps the combined length at 500 chars (tags with spaces count their quotes). */
function tagsLength(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

function multipartRelated(meta: unknown, media: Buffer, mediaType: string): { body: Buffer; contentType: string } {
  const boundary = `openlens_${Math.random().toString(36).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, media, tail]), contentType: `multipart/related; boundary=${boundary}` };
}

function langOf(pub: Publication): string | undefined {
  return typeof pub.response?.lang === "string" ? pub.response.lang : undefined;
}

function tierOf(pub: Publication): Tier | undefined {
  const t = pub.response?.tier;
  return t === "regional" || t === "national" || t === "international" ? t : undefined;
}

// ---------- publisher ----------
export const youtubePublisher = definePublisher<YtState>({
  channel: "youtube",
  kinds: ["yt_meta"],
  status: () => status(),

  async validate(output, ctx, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const parsed = YtMetaPayload.safeParse(output.payload);
    if (!parsed.success) return { errors: [`invalid yt_meta payload: ${zodMessage(parsed.error)}`], warnings };
    const meta = parsed.data;

    if (!meta.title.trim()) errors.push("title is empty");
    if (meta.title.length > L.titleMax) errors.push(`title is ${meta.title.length} chars (max ${L.titleMax})`);
    if (meta.description.length > L.descriptionMax) errors.push(`description is ${meta.description.length} chars (max ${L.descriptionMax})`);
    if (/[<>]/.test(meta.title + meta.description)) errors.push("title/description must not contain '<' or '>' (rejected by YouTube)");
    if (tagsLength(meta.tags) > 500) errors.push(`tags total ${tagsLength(meta.tags)} chars (max 500)`);
    if (!meta.description.includes(ctx.storyUrl)) errors.push(`description must link to the story (${ctx.storyUrl})`);

    if (output.aiDisclosure) {
      if (!meta.containsSyntheticMedia) errors.push("aiDisclosure is set but containsSyntheticMedia is false (status.containsSyntheticMedia must be true)");
      if (!hasAiDisclosure(meta.description)) errors.push("description must contain an AI disclosure (e.g. 'AI-generated presenter')");
    } else if (meta.containsSyntheticMedia && !hasAiDisclosure(meta.description)) {
      warnings.push("containsSyntheticMedia is true but the description has no AI disclosure text");
    }
    if (output.tier && output.tier !== meta.tier) warnings.push(`output.tier (${output.tier}) differs from payload.tier (${meta.tier}); using payload.tier`);
    if (opts?.mode === "live" && !refreshTokenEnvFor(meta.tier, output.lang)) errors.push(`no refresh token for ${output.lang}/${meta.tier} (${langTokenEnv(output.lang)}, ${TIER_ENV[meta.tier]} or YOUTUBE_REFRESH_TOKEN)`);
    else if (env("YOUTUBE_REFRESH_TOKEN") && !env(TIER_ENV[meta.tier]) && !env(langTokenEnv(output.lang))) warnings.push(`no ${TIER_ENV[meta.tier]}; using the default channel (YOUTUBE_REFRESH_TOKEN)`);

    const loc = output.payload.localizations;
    if (loc !== undefined && !Localizations.safeParse(loc).success) errors.push("payload.localizations must map lang -> {title<=100, description<=5000}");

    const v = await resolveVideo(output, ctx, meta.videoOutputId);
    if ("error" in v) errors.push(v.error);
    else {
      if (v.record.status !== "approved" && v.record.status !== "published") warnings.push(`video output ${v.record.id} is ${v.record.status}`);
      if (v.video.durationSeconds <= 0) errors.push("video duration must be > 0");
      if (v.video.aspect === "9:16" && v.video.durationSeconds > 180) warnings.push("vertical video over 180s will not be treated as a Short");
    }

    const sched = checkSchedule(opts?.scheduleAt, 60_000, 365 * 86_400_000);
    if (sched) errors.push(sched);
    if (opts?.scheduleAt && privacyStatus() !== "private") warnings.push("scheduled uploads are inserted as private and flip public at publishAt");
    return { errors, warnings };
  },

  async prepare(output, ctx, opts) {
    const meta = YtMetaPayload.parse(output.payload);
    const v = await resolveVideo(output, ctx, meta.videoOutputId);
    if ("error" in v) throw new PublishError("validation_failed", v.error);
    const video = v.video;
    const localizations = localizationsOf(output);
    const parts = ["snippet", "status", ...(localizations ? ["localizations"] : [])].join(",");
    const insertUrl = `${UPLOAD}/videos?uploadType=resumable&part=${parts}&notifySubscribers=${boolEnv("YOUTUBE_NOTIFY_SUBSCRIBERS") ? "true" : "false"}`;
    const insertBody: Record<string, unknown> = {
      snippet: snippet(meta, output),
      status: {
        privacyStatus: opts.scheduleAt ? "private" : privacyStatus(),
        ...(opts.scheduleAt ? { publishAt: new Date(opts.scheduleAt).toISOString() } : {}),
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: meta.containsSyntheticMedia,
        embeddable: true,
        license: "youtube",
      },
      ...(localizations ? { localizations } : {}),
    };
    const tokenEnv = refreshTokenEnvFor(meta.tier, output.lang) ?? `${langTokenEnv(output.lang)} | ${TIER_ENV[meta.tier]} | YOUTUBE_REFRESH_TOKEN`;
    const auth = `OAuth2 bearer (refresh token from ${tokenEnv})`;
    const requests: RequestSpec[] = [
      { step: "oauth.refresh", method: "POST", url: GOOGLE_TOKEN_URL, body: { grant_type: "refresh_token", refresh_token: `$${tokenEnv}` } },
      {
        step: "videos.insert (resumable init)",
        method: "POST",
        url: insertUrl,
        auth,
        headers: { "X-Upload-Content-Type": contentTypeFor(video.mp4Url) },
        body: insertBody,
      },
      { step: "videos.insert (upload bytes)", method: "PUT", url: "{{upload_session_uri}}", auth, body: `<binary ${video.mp4Url}>` },
    ];
    let captions: YtState["captions"];
    if (video.captionsVttUrl) {
      const capSnippet = { videoId: "{{video_id}}", language: output.lang, name: `${output.lang} (OpenLens)`, isDraft: false };
      captions = { url: `${UPLOAD}/captions?uploadType=multipart&part=snippet`, snippet: capSnippet, asset: video.captionsVttUrl };
      requests.push({ step: "captions.insert", method: "POST", url: captions.url, auth, body: { snippet: capSnippet, media: `<${video.captionsVttUrl}>` } });
    }
    let thumbnail: YtState["thumbnail"];
    if (video.thumbnailUrl) {
      thumbnail = { asset: video.thumbnailUrl };
      requests.push({ step: "thumbnails.set", method: "POST", url: `${UPLOAD}/thumbnails/set?videoId={{video_id}}&uploadType=media`, auth, body: `<binary ${video.thumbnailUrl}>` });
    }
    return { requests, state: { tier: meta.tier, lang: output.lang, video, insertUrl, insertBody, captions, thumbnail } };
  },

  async execute(prep, _output, ctx) {
    const s = prep.state;
    const token = await accessToken(s.tier, s.lang);
    const authz = { Authorization: `Bearer ${token}` };
    const location = await ctx.resolveAsset(s.video.mp4Url, { public: false });
    const bytes = await loadAsset(location, "youtube.video");
    const mediaType = contentTypeFor(s.video.mp4Url);

    const init = await http({
      method: "POST",
      url: s.insertUrl,
      label: "youtube.videos.insert.init",
      headers: { ...authz, "X-Upload-Content-Type": mediaType, "X-Upload-Content-Length": String(bytes.byteLength) },
      json: s.insertBody,
    });
    const sessionUri = init.headers.get("location");
    if (!sessionUri) throw new Error("youtube.videos.insert.init: no upload session URI in Location header");

    const up = await http({
      method: "PUT",
      url: sessionUri,
      label: "youtube.videos.insert.upload",
      headers: { ...authz, "Content-Type": mediaType },
      body: bytes,
      timeoutMs: 15 * 60_000,
    });
    const videoId = up.json?.id as string | undefined;
    if (!videoId) throw new Error("youtube.videos.insert.upload: response has no video id");
    const extras: Record<string, unknown> = {};
    const warnings: string[] = [];

    if (s.captions) {
      try {
        const vtt = await loadAsset(await ctx.resolveAsset(s.captions.asset, { public: false }), "youtube.captions");
        const mp = multipartRelated({ snippet: { ...s.captions.snippet, videoId } }, vtt, "text/vtt");
        const cap = await http({ method: "POST", url: s.captions.url, label: "youtube.captions.insert", headers: { ...authz, "Content-Type": mp.contentType }, body: mp.body });
        extras.captionId = cap.json?.id;
      } catch (err) {
        warnings.push(`captions upload failed: ${formatError(err)}`);
      }
    }
    if (s.thumbnail) {
      try {
        const img = await loadAsset(await ctx.resolveAsset(s.thumbnail.asset, { public: false }), "youtube.thumbnail");
        await http({
          method: "POST",
          url: `${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
          label: "youtube.thumbnails.set",
          headers: { ...authz, "Content-Type": contentTypeFor(s.thumbnail.asset) },
          body: img,
        });
        extras.thumbnailSet = true;
      } catch (err) {
        warnings.push(`thumbnail upload failed (needs a verified channel): ${formatError(err)}`);
      }
    }
    const isShort = s.video.aspect === "9:16" && s.video.durationSeconds <= 180;
    return {
      externalId: videoId,
      url: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
      response: {
        tier: s.tier,
        lang: s.lang,
        refreshTokenEnv: refreshTokenEnvFor(s.tier, s.lang),
        request: s.insertBody,
        video: { id: videoId, status: up.json?.status, uploadStatus: up.json?.status?.uploadStatus },
        ...extras,
        ...(warnings.length ? { stepWarnings: warnings } : {}),
      },
    };
  },

  async update(pub, output, ctx) {
    const parsed = YtMetaPayload.safeParse(output.payload);
    if (!parsed.success) throw new PublishError("bad_request", `invalid yt_meta payload: ${zodMessage(parsed.error)}`);
    const meta = parsed.data;
    const description = appendCorrection(meta.description, correctionNote(ctx), L.descriptionMax);
    const localizations = localizationsOf(output);
    const parts = ["snippet", ...(localizations ? ["localizations"] : [])].join(",");
    const url = `${API}/videos?part=${parts}`;
    const body = { id: pub.externalId, snippet: snippet(meta, output, description), ...(localizations ? { localizations } : {}) };
    const tier = tierOf(pub) ?? meta.tier;
    return runFollowUp({
      pub,
      action: "update",
      channel: "youtube",
      status: status(tier, langOf(pub)),
      onSuccess: "corrected",
      ledgerVersion: output.ledgerVersion,
      requests: [{ step: "videos.update", method: "PUT", url, body }],
      run: async () => {
        const token = await accessToken(tier, langOf(pub));
        const res = await http({ method: "PUT", url, label: "youtube.videos.update", headers: { Authorization: `Bearer ${token}` }, json: body });
        return { id: res.json?.id, title: res.json?.snippet?.title };
      },
    });
  },

  async retract(pub: Publication, _ctx: PublishContext) {
    const tier = tierOf(pub);
    const prevStatus = (pub.response?.request as { status?: { containsSyntheticMedia?: boolean } } | undefined)?.status;
    const url = `${API}/videos?part=status`;
    const body = {
      id: pub.externalId,
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: prevStatus?.containsSyntheticMedia ?? true, embeddable: true, license: "youtube" },
    };
    return runFollowUp({
      pub,
      action: "retract",
      channel: "youtube",
      status: status(tier, langOf(pub)),
      onSuccess: "retracted",
      requests: [{ step: "videos.update (set private)", method: "PUT", url, body }],
      run: async () => {
        const token = await accessToken(tier, langOf(pub));
        const res = await http({ method: "PUT", url, label: "youtube.videos.retract", headers: { Authorization: `Bearer ${token}` }, json: body });
        return { id: res.json?.id, privacyStatus: res.json?.status?.privacyStatus };
      },
    });
  },
});
