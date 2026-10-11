import { CHANNEL_LIMITS } from "@openlens/config";
import { CarouselPayload, IgReelPayload, type OutputRecord, type Publication } from "@openlens/schemas";
import { definePublisher, manualFollowUp, runFollowUp } from "../base.js";
import { env, intEnv, statusFromMissing } from "../env.js";
import type { PublishContext, RequestSpec } from "../types.js";
import { PublishError } from "../types.js";
import { correctionNote, hasAiDisclosure, isHttpsUrl, resolveVideo, sleep, zodMessage } from "../util.js";
import { graph } from "./meta.js";

const L = CHANNEL_LIMITS.instagram;
const REQUIRED = ["IG_USER_ID", "META_PAGE_ACCESS_TOKEN"];
const TOKEN = "META_PAGE_ACCESS_TOKEN";
const status = () => statusFromMissing(REQUIRED);
const igUser = () => env("IG_USER_ID") ?? "{IG_USER_ID}";

function composeCaption(caption: string, hashtags: string[]): string {
  const missing = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).filter((h) => !caption.includes(h));
  return missing.length ? `${caption}\n\n${missing.join(" ")}` : caption;
}

function hashtagCount(text: string): number {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

/** Extension: rendered slide images. CarouselPayload has no image field yet (see README). */
function slideImages(output: OutputRecord): (string | undefined)[] {
  const slides = (output.payload as { slides?: { imageUrl?: unknown }[] }).slides ?? [];
  return slides.map((s) => (typeof s?.imageUrl === "string" ? s.imageUrl : undefined));
}

interface IgState {
  kind: "reel" | "carousel";
  caption: string;
  videoUrl?: string;
  imageUrls?: string[];
}

function checkCaption(caption: string, output: OutputRecord, ctx: PublishContext, errors: string[], warnings: string[]) {
  if (caption.length > L.captionMax) errors.push(`caption is ${caption.length} chars incl. hashtags (max ${L.captionMax})`);
  if (hashtagCount(caption) > 30) errors.push(`caption has ${hashtagCount(caption)} hashtags (max 30)`);
  if (output.aiDisclosure && !hasAiDisclosure(caption)) errors.push("caption must contain an AI disclosure (aiDisclosure is set)");
  if (!caption.includes(ctx.storyUrl)) warnings.push("caption has no story link (links in IG captions are not clickable; point to bio link)");
  if (output.aiDisclosure) warnings.push("Instagram's 'AI info' label cannot be set via API; the caption disclosure is the label");
}

export const instagramPublisher = definePublisher<IgState>({
  channel: "instagram",
  kinds: ["ig_reel", "carousel"],
  status,

  async validate(output, ctx, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (opts?.scheduleAt) errors.push("Instagram has no native scheduling via API; schedule the publish job instead");
    if (output.kind === "ig_reel") {
      const p = IgReelPayload.safeParse(output.payload);
      if (!p.success) return { errors: [`invalid ig_reel payload: ${zodMessage(p.error)}`], warnings };
      checkCaption(composeCaption(p.data.caption, p.data.hashtags), output, ctx, errors, warnings);
      const v = await resolveVideo(output, ctx, p.data.videoOutputId);
      if ("error" in v) errors.push(v.error);
      else {
        const [min, max] = L.reelSeconds;
        if (v.video.aspect !== "9:16") errors.push(`Reels need a 9:16 video (got ${v.video.aspect})`);
        if (v.video.durationSeconds < min || v.video.durationSeconds > max) errors.push(`Reel duration ${v.video.durationSeconds}s is outside ${min}-${max}s`);
        const url = await ctx.resolveAsset(v.video.mp4Url, { public: true });
        if (!isHttpsUrl(url)) errors.push(`Instagram fetches video_url itself: resolveAsset must return a public https URL (got ${url.slice(0, 60)})`);
      }
    } else {
      const p = CarouselPayload.safeParse(output.payload);
      if (!p.success) return { errors: [`invalid carousel payload: ${zodMessage(p.error)}`], warnings };
      checkCaption(p.data.caption, output, ctx, errors, warnings);
      const imgs = slideImages(output);
      const missing = imgs.map((u, i) => (u ? -1 : i + 1)).filter((i) => i > 0);
      if (missing.length) errors.push(`carousel slides ${missing.join(", ")} have no rendered imageUrl`);
      for (const u of imgs) {
        if (!u) continue;
        const r = await ctx.resolveAsset(u, { public: true });
        if (!isHttpsUrl(r)) {
          errors.push("carousel images must resolve to public https URLs");
          break;
        }
      }
    }
    return { errors, warnings };
  },

  async prepare(output, ctx) {
    const auth = `Bearer ${TOKEN}`;
    const requests: RequestSpec[] = [];
    let state: IgState;
    if (output.kind === "ig_reel") {
      const p = IgReelPayload.parse(output.payload);
      const v = await resolveVideo(output, ctx, p.videoOutputId);
      if ("error" in v) throw new PublishError("validation_failed", v.error);
      const videoUrl = await ctx.resolveAsset(v.video.mp4Url, { public: true });
      state = { kind: "reel", caption: composeCaption(p.caption, p.hashtags), videoUrl };
      requests.push({
        step: "media (REELS container)",
        method: "POST",
        url: `/${igUser()}/media`,
        auth,
        body: { media_type: "REELS", video_url: videoUrl, caption: state.caption, share_to_feed: true },
      });
    } else {
      const p = CarouselPayload.parse(output.payload);
      const imageUrls = await Promise.all(slideImages(output).map((u) => ctx.resolveAsset(u!, { public: true })));
      state = { kind: "carousel", caption: p.caption, imageUrls };
      imageUrls.forEach((u, i) =>
        requests.push({ step: `media (carousel item ${i + 1})`, method: "POST", url: `/${igUser()}/media`, auth, body: { image_url: u, is_carousel_item: true } }),
      );
      requests.push({
        step: "media (CAROUSEL container)",
        method: "POST",
        url: `/${igUser()}/media`,
        auth,
        body: { media_type: "CAROUSEL", children: imageUrls.map((_, i) => `{{item_${i + 1}_id}}`).join(","), caption: state.caption },
      });
    }
    requests.push(
      { step: "poll container status_code until FINISHED", method: "GET", url: "/{{container_id}}?fields=status_code,status", auth },
      { step: "media_publish", method: "POST", url: `/${igUser()}/media_publish`, auth, body: { creation_id: "{{container_id}}" } },
    );
    return { requests: requests.map((r) => ({ ...r, url: r.url.startsWith("/") ? `graph.facebook.com${r.url}` : r.url })), state };
  },

  async execute(prep) {
    const s = prep.state;
    const ig = env("IG_USER_ID")!;
    let containerId: string;
    if (s.kind === "reel") {
      const c = await graph(TOKEN, "POST", `/${ig}/media`, "instagram.media.reel", {
        json: { media_type: "REELS", video_url: s.videoUrl, caption: s.caption, share_to_feed: true },
      });
      containerId = c.json?.id;
    } else {
      const children: string[] = [];
      for (const u of s.imageUrls ?? []) {
        const c = await graph(TOKEN, "POST", `/${ig}/media`, "instagram.media.item", { json: { image_url: u, is_carousel_item: true } });
        children.push(c.json?.id);
      }
      const c = await graph(TOKEN, "POST", `/${ig}/media`, "instagram.media.carousel", {
        json: { media_type: "CAROUSEL", children: children.join(","), caption: s.caption },
      });
      containerId = c.json?.id;
    }
    if (!containerId) throw new Error("instagram.media: no container id");

    const deadline = Date.now() + intEnv("IG_POLL_TIMEOUT_MS", 300_000);
    for (;;) {
      const st = await graph(TOKEN, "GET", `/${containerId}?fields=status_code,status`, "instagram.container.status");
      const code = st.json?.status_code as string | undefined;
      if (code === "FINISHED") break;
      if (code === "ERROR" || code === "EXPIRED") throw new Error(`instagram.container: ${code} ${st.json?.status ?? ""}`.trim());
      if (Date.now() > deadline) throw new Error(`instagram.container: not FINISHED after ${Math.round(intEnv("IG_POLL_TIMEOUT_MS", 300_000) / 1000)}s (last ${code})`);
      await sleep(intEnv("IG_POLL_INTERVAL_MS", 5_000));
    }

    const pub = await graph(TOKEN, "POST", `/${ig}/media_publish`, "instagram.media_publish", { json: { creation_id: containerId }, retry5xx: false });
    const mediaId = pub.json?.id as string | undefined;
    if (!mediaId) throw new Error("instagram.media_publish: no media id");
    let permalink: string | undefined;
    try {
      permalink = (await graph(TOKEN, "GET", `/${mediaId}?fields=permalink`, "instagram.permalink")).json?.permalink;
    } catch {
      permalink = undefined;
    }
    return { externalId: mediaId, url: permalink, response: { containerId, mediaId, kind: s.kind } };
  },

  /** Captions of published IG media can't be edited via API: add a correction comment instead. */
  async update(pub: Publication, output: OutputRecord, ctx: PublishContext) {
    const body = { message: correctionNote(ctx) };
    const path = `/${pub.externalId}/comments`;
    return runFollowUp({
      pub,
      action: "update",
      channel: "instagram",
      status: status(),
      onSuccess: "corrected",
      ledgerVersion: output.ledgerVersion,
      requests: [{ step: "comments (correction)", method: "POST", url: `graph.facebook.com${path}`, body }],
      run: async () => ({ commentId: (await graph(TOKEN, "POST", path, "instagram.correction_comment", { json: body, retry5xx: false })).json?.id }),
    });
  },

  async retract(pub: Publication) {
    if (pub.mode === "dry_run") return { ...pub, status: "retracted" };
    return manualFollowUp(
      pub,
      "retract",
      `Instagram Graph API cannot delete published media; delete or archive media ${pub.externalId} manually in the Instagram app`,
    );
  },
});
