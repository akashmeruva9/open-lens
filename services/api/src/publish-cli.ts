// Publish a story's posts to the channels (dry-run by default).
//
//   One post:      npm run publish -w @openlens/api -- <storyId> --lang ja --channel instagram [--kind ig_reel] [--live] [--approve]
//   Everywhere:    npm run publish -w @openlens/api -- <storyId> --all [--langs en,ja] [--channel youtube] [--live] [--approve] [--republish]
//
// --all covers YouTube, Instagram (Reel) and Facebook for every language the story has, each to the account that language is
// routed to (YOUTUBE_REFRESH_TOKEN_<LANG>, IG_USER_ID_<LANG>, FB_PAGE_ID_<LANG>). It skips anything already published,
// anything whose video is not approved, and any channel/language without credentials, then prints one summary table.
//
// Dry-run never writes anything and prints the exact requests. --live posts for real and needs --approve (or posts that are
// already approved) so a person has signed off. Everyone who publishes should use the same shared store (STORE=firestore
// on the shared project): "already published" is read from it, which is what stops two people posting the same story twice.
// Credentials come from the environment (~/.openlens/youtube.env, ~/.openlens/instagram.env).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_WEB_URL } from "@openlens/config";
import type { Channel, OutputRecord, Publication } from "@openlens/schemas";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { FileStore, FirestoreStore, type Store, type StoryRecord } from "./store.js";
import { type PublishContext, publisher } from "./publishing.js";

const DATA_DIR = resolve(process.env.DATA_DIR ?? `${resolve(import.meta.dirname, "../../..")}/.data`);
const WORK_DIR = resolve(process.env.WORK_DIR ?? `${DATA_DIR}/work`);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const storyId = args[0];
const all = flag("all");
const live = flag("live");
const approve = flag("approve");
const user = process.env.USER ?? "cli";

/** What "everywhere" means: one post type per channel. Add X / carousel here when they are wanted. */
const PLAN: { channel: Channel; kind: string }[] = [
  { channel: "youtube", kind: "yt_meta" },
  { channel: "instagram", kind: "ig_reel" },
  { channel: "facebook", kind: "fb_post" },
];

if (!storyId || storyId.startsWith("--") || (!all && !opt("lang"))) {
  console.error("usage: publish <storyId> (--lang <lang> --channel <youtube|instagram|facebook> [--kind <output kind>] | --all [--langs en,ja] [--channel <one>]) [--live] [--approve] [--republish]");
  process.exit(1);
}

async function makeStore(): Promise<Store> {
  if (process.env.STORE === "firestore") {
    const { initializeApp, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
    const db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    return new FirestoreStore(db);
  }
  return new FileStore(DATA_DIR);
}
const assets: AssetStore = process.env.ASSETS_BUCKET ? new GcsAssets(process.env.ASSETS_BUCKET, `${WORK_DIR}/asset-cache`) : new LocalAssets(`${DATA_DIR}/assets`);
const store = await makeStore();
const pub = await publisher();
if (!pub) throw new Error("@openlens/publisher is not built: npm run build -w @openlens/publisher");

const republish = flag("republish"); // post again although a live publication exists (e.g. after re-rendering the video); the old post stays
const alreadyPublished = (rec: StoryRecord, o: OutputRecord) =>
  !republish && (o.status === "published" || rec.publications.some((p) => p.outputId === o.id && p.mode === "live" && p.status === "published"));

function contextFor(rec: StoryRecord): PublishContext {
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

interface Row { channel: string; lang: string; outcome: "published" | "dry-run ok" | "skipped" | "failed"; detail: string; publication?: Publication }

/** Publish one output. Never throws: the outcome says what happened. */
async function publishOne(outputId: string): Promise<Row> {
  let rec = (await store.get(storyId))!; // fresh read: someone else may have just posted it
  let output = rec.outputs.find((o) => o.id === outputId)!;
  const row = (outcome: Row["outcome"], detail: string, publication?: Publication): Row => ({ channel: output.channel, lang: output.lang, outcome, detail, publication });
  try {
    if (alreadyPublished(rec, output)) {
      const prior = rec.publications.filter((p) => p.outputId === output.id && p.status === "published").at(-1);
      return row("skipped", `already published${prior?.url ? ` ${prior.url}` : ""}`);
    }
    // The video this post points at must be approved when going live (a draft video may be an old or unchecked render).
    const videoId = (output.payload as { videoOutputId?: string }).videoOutputId;
    const video = videoId ? rec.outputs.find((o) => o.id === videoId) : undefined;
    if (live && video && video.status !== "approved" && video.status !== "published") return row("skipped", `video ${video.id} is "${video.status}", not approved`);

    if (live) {
      if (output.status !== "approved" && output.status !== "published" && !approve) return row("skipped", `post is "${output.status}"; rerun with --approve to sign off`);
      if (output.status !== "approved") {
        output = { ...output, status: "approved", approvedBy: user, ledgerVersion: rec.story.version, updatedAt: new Date().toISOString() };
        rec.outputs = rec.outputs.map((o) => (o.id === output.id ? output : o));
        await store.put(rec);
      }
    } else if (output.status !== "approved" && output.status !== "published") {
      output = { ...output, status: "approved" }; // in memory only
    }

    const ctx = contextFor(rec);
    const p = pub!.getPublisher(output.channel);
    const mode = live ? "live" : "dry_run";
    const v = await p.validate(output, ctx, { mode });
    for (const w of v.warnings) console.error(`  warning (${output.channel}/${output.lang}): ${w}`);
    if (!v.ok) return row(/no (Instagram account|Facebook Page|YouTube|refresh token)|no refresh token/i.test(v.errors.join(" ")) ? "skipped" : "failed", v.errors.join("; "));

    const publication = await p.publish(output, ctx, { mode });
    if (live) {
      rec = (await store.get(storyId))!;
      rec.publications = [...rec.publications, publication];
      if (publication.status === "published") rec.outputs = rec.outputs.map((o) => (o.id === output.id ? { ...o, status: "published", updatedAt: new Date().toISOString() } : o));
      await store.put(rec);
    }
    if (publication.status !== "published") return row("failed", publication.error ?? publication.status, publication);
    return row(live ? "published" : "dry-run ok", publication.url ?? (live ? "" : `${(publication.response?.requests as unknown[] | undefined)?.length ?? 0} requests`), publication);
  } catch (e) {
    return row("failed", e instanceof Error ? e.message : String(e));
  }
}

const rec0 = await store.get(storyId);
if (!rec0) throw new Error(`story not found: ${storyId}`);

if (!all) {
  // One post, as before: print the full publication.
  const channel = (opt("channel") ?? "youtube") as Channel;
  const lang = opt("lang")!;
  const kind = opt("kind");
  const candidates = rec0.outputs.filter((o) => o.channel === channel && o.lang === lang && o.kind !== "video" && (!kind || o.kind === kind));
  if (!candidates.length) throw new Error(`no ${channel} output for ${storyId} in "${lang}" (found: ${[...new Set(rec0.outputs.map((o) => `${o.channel}/${o.lang}`))].join(", ")})`);
  if (candidates.length > 1) throw new Error(`several ${channel}/${lang} outputs: ${candidates.map((o) => o.id).join(", ")} (use --kind)`);
  const r = await publishOne(candidates[0]!.id);
  if (r.outcome === "failed" || r.outcome === "skipped") {
    console.error(`${r.outcome}: ${r.detail}`);
    process.exit(r.outcome === "failed" ? 2 : 3);
  }
  console.log(JSON.stringify(r.publication, null, 2));
} else {
  const wantLangs = opt("langs")?.split(",").map((s) => s.trim()).filter(Boolean);
  const onlyChannel = opt("channel");
  const langs = wantLangs ?? [...new Set(rec0.outputs.filter((o) => PLAN.some((p) => p.channel === o.channel && p.kind === o.kind)).map((o) => o.lang))].sort();
  console.error(`${live ? "LIVE" : "dry run"}: ${storyId}  languages ${langs.join(", ")}  channels ${PLAN.filter((p) => !onlyChannel || p.channel === onlyChannel).map((p) => p.channel).join(", ")}${live && !approve ? "  (no --approve: only already-approved posts)" : ""}\n`);
  const rows: Row[] = [];
  for (const lang of langs) {
    for (const item of PLAN) {
      if (onlyChannel && item.channel !== onlyChannel) continue;
      const out = rec0.outputs.find((o) => o.channel === item.channel && o.kind === item.kind && o.lang === lang);
      if (!out) {
        rows.push({ channel: item.channel, lang, outcome: "skipped", detail: `no ${item.kind} post for this language` });
        continue;
      }
      const r = await publishOne(out.id);
      rows.push(r);
      console.error(`${r.channel.padEnd(10)} ${r.lang.padEnd(4)} ${r.outcome.padEnd(11)} ${r.detail}`);
    }
  }
  const n = (o: Row["outcome"]) => rows.filter((r) => r.outcome === o).length;
  console.error(`\n${n("published") + n("dry-run ok")} ${live ? "published" : "ok (dry run)"}, ${n("skipped")} skipped, ${n("failed")} failed`);
  console.log(JSON.stringify(rows.map(({ publication: _p, ...r }) => r), null, 2));
  if (n("failed")) process.exit(2);
}
