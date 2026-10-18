// Posting a story to the social channels. Used by the publish command (a person at a terminal) and by the wire (automatically,
// after a low-risk story goes live). One code path, so what is tested by hand is what runs by itself.
import { existsSync } from "node:fs";
import { PUBLIC_WEB_URL } from "@openlens/config";
import type { Channel, OutputRecord, Publication } from "@openlens/schemas";
import type { AssetStore } from "./assets.js";
import { publisher, type PublishContext } from "./publishing.js";
import type { Store, StoryRecord } from "./store.js";

/** What "everywhere" means: one post type per channel. Add X / carousel here when they are wanted. */
export const PLAN: { channel: Channel; kind: string }[] = [
  { channel: "youtube", kind: "yt_meta" },
  { channel: "instagram", kind: "ig_reel" },
  { channel: "facebook", kind: "fb_post" },
];

export interface Row {
  channel: string;
  lang: string;
  outcome: "published" | "dry-run ok" | "skipped" | "failed";
  detail: string;
  publication?: Publication;
}

export interface PostOptions {
  store: Store;
  assets: AssetStore;
  storyId: string;
  live: boolean;
  /** Sign off the posts as this run goes (needed for live unless they are already approved). */
  approve?: boolean;
  /** Post again although a live publication exists (e.g. after re-rendering the video). */
  republish?: boolean;
  user?: string;
  /** Called before each live post: false = skip (daily limit). */
  allow?: (channel: Channel) => boolean;
  /** Called after each live post. */
  onPosted?: (channel: Channel) => void;
}

const alreadyPublished = (rec: StoryRecord, o: OutputRecord, republish?: boolean) =>
  !republish && (o.status === "published" || rec.publications.some((p) => p.outputId === o.id && p.mode === "live" && p.status === "published"));

function contextFor(rec: StoryRecord, assets: AssetStore, user: string): PublishContext {
  return {
    approvedBy: user,
    storyUrl: `${PUBLIC_WEB_URL}/story/${rec.story.id}`,
    getOutput: async (id) => rec.outputs.find((o) => o.id === id),
    resolveAsset: async (p, { public: isPublic }) => {
      if (isPublic) {
        if (/^https:/.test(p)) return p;
        throw new Error("this channel needs a public media URL; set ASSETS_BUCKET");
      }
      const local = assets.localPath(p);
      return local && existsSync(local) ? local : p; // cache miss: the publisher downloads the bucket URL
    },
  };
}

/** Post one output. Never throws: the outcome says what happened. */
export async function postOutput(o: PostOptions, outputId: string): Promise<Row> {
  const user = o.user ?? "auto";
  const pub = await publisher();
  let rec = (await o.store.get(o.storyId))!; // fresh read: someone else may have just posted it
  let output = rec.outputs.find((x) => x.id === outputId)!;
  const row = (outcome: Row["outcome"], detail: string, publication?: Publication): Row => ({ channel: output.channel, lang: output.lang, outcome, detail, publication });
  try {
    if (!pub) return row("failed", "@openlens/publisher is not installed");
    if (alreadyPublished(rec, output, o.republish)) {
      const prior = rec.publications.filter((p) => p.outputId === output.id && p.status === "published").at(-1);
      return row("skipped", `already published${prior?.url ? ` ${prior.url}` : ""}`);
    }
    // The video this post points at must be approved when going live (a draft video may be an old or unchecked render).
    const videoId = (output.payload as { videoOutputId?: string }).videoOutputId;
    const video = videoId ? rec.outputs.find((x) => x.id === videoId) : undefined;
    if (o.live && video && video.status !== "approved" && video.status !== "published") return row("skipped", `video ${video.id} is "${video.status}", not approved`);

    if (o.live) {
      if (output.status !== "approved" && output.status !== "published" && !o.approve) return row("skipped", `post is "${output.status}"; needs approval`);
      if (o.allow && !o.allow(output.channel)) return row("skipped", "daily limit for this channel reached");
      if (output.status !== "approved") {
        output = { ...output, status: "approved", approvedBy: user, ledgerVersion: rec.story.version, updatedAt: new Date().toISOString() };
        rec.outputs = rec.outputs.map((x) => (x.id === output.id ? output : x));
        await o.store.put(rec);
      }
    } else if (output.status !== "approved" && (o.republish || output.status !== "published")) {
      output = { ...output, status: "approved" }; // in memory only
    }

    // Reach hashtags for this channel (our videos are all vertical).
    output = pub.withHashtags?.(output, { topics: rec.story.topics, region: rec.story.region, siblings: rec.outputs }, { vertical: true }) ?? output;
    const ctx = contextFor(rec, o.assets, user);
    const p = pub.getPublisher(output.channel);
    const mode = o.live ? "live" : "dry_run";
    const v = await p.validate(output, ctx, { mode });
    for (const w of v.warnings) console.error(`  warning (${output.channel}/${output.lang}): ${w}`);
    if (!v.ok) return row(/no (Instagram account|Facebook Page|YouTube|refresh token)|no refresh token/i.test(v.errors.join(" ")) ? "skipped" : "failed", v.errors.join("; "));

    const publication = await p.publish(output, ctx, { mode });
    if (o.live) {
      rec = (await o.store.get(o.storyId))!;
      rec.publications = [...rec.publications, publication];
      if (publication.status === "published") rec.outputs = rec.outputs.map((x) => (x.id === output.id ? { ...x, status: "published", updatedAt: new Date().toISOString() } : x));
      await o.store.put(rec);
    }
    if (publication.status !== "published") return row("failed", publication.error ?? publication.status, publication);
    if (o.live) o.onPosted?.(output.channel);
    return row(o.live ? "published" : "dry-run ok", publication.url ?? (o.live ? "" : `${(publication.response?.requests as unknown[] | undefined)?.length ?? 0} requests`), publication);
  } catch (e) {
    return row("failed", e instanceof Error ? e.message : String(e));
  }
}

/** Post a story everywhere it can go, for the given languages (default: every language it has). */
export async function postStory(o: PostOptions & { langs?: string[]; channel?: string; onRow?: (r: Row) => void }): Promise<Row[]> {
  const rec = await o.store.get(o.storyId);
  if (!rec) throw new Error(`story not found: ${o.storyId}`);
  const langs = o.langs ?? [...new Set(rec.outputs.filter((x) => PLAN.some((p) => p.channel === x.channel && p.kind === x.kind)).map((x) => x.lang))].sort();
  const rows: Row[] = [];
  for (const lang of langs) {
    for (const item of PLAN) {
      if (o.channel && item.channel !== o.channel) continue;
      const out = rec.outputs.find((x) => x.channel === item.channel && x.kind === item.kind && x.lang === lang);
      const r: Row = out ? await postOutput(o, out.id) : { channel: item.channel, lang, outcome: "skipped", detail: `no ${item.kind} post for this language` };
      rows.push(r);
      o.onRow?.(r);
    }
  }
  return rows;
}

// ---------- automatic posting (the wire calls this after a low-risk story goes live) ----------

export interface SocialBudget { day: string; youtube: number; instagram: number; facebook: number }

/** Posts per channel per day. YouTube's default API quota allows about 4 uploads a day; the others are kept low so a new account does not look like spam. */
export const dailyCaps = (env: Record<string, string | undefined> = process.env): Record<"youtube" | "instagram" | "facebook", number> => ({
  youtube: Number(env.AUTO_SOCIAL_YT_PER_DAY ?? 4),
  instagram: Number(env.AUTO_SOCIAL_IG_PER_DAY ?? 8),
  facebook: Number(env.AUTO_SOCIAL_FB_PER_DAY ?? 8),
});

/**
 * AUTO_SOCIAL=1 posts for real, AUTO_SOCIAL=dry only logs what it would post, anything else does nothing.
 * Only a story that is live, low risk and has no blocking check is posted; sensitive ones stay for a person.
 */
export async function autoSocial(deps: { store: Store; assets: AssetStore }, storyId: string): Promise<Row[]> {
  const mode = process.env.AUTO_SOCIAL;
  if (mode !== "1" && mode !== "dry") return [];
  const rec = await deps.store.get(storyId);
  if (!rec || rec.story.status !== "published" || rec.story.riskTier !== "low" || rec.story.checksFlagged) return [];
  const day = new Date().toISOString().slice(0, 10);
  const saved = await deps.store.getState<SocialBudget>("social-budget", { day, youtube: 0, instagram: 0, facebook: 0 });
  const budget: SocialBudget = saved.day === day ? saved : { day, youtube: 0, instagram: 0, facebook: 0 };
  const caps = dailyCaps();
  const rows = await postStory({
    ...deps,
    storyId,
    live: mode === "1",
    approve: true,
    user: "auto",
    allow: (ch) => (budget[ch as keyof typeof caps] ?? 0) < (caps[ch as keyof typeof caps] ?? 0),
    onPosted: (ch) => {
      const k = ch as keyof typeof caps;
      if (k in caps) budget[k]++;
    },
  });
  await deps.store.putState("social-budget", budget);
  for (const r of rows) console.log(`[social] ${storyId} ${r.channel}/${r.lang}: ${r.outcome} ${r.detail}`.slice(0, 300));
  return rows;
}
