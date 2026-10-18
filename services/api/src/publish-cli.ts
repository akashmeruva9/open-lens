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
// The server runs the same code by itself for new low-risk stories (see social.ts, AUTO_SOCIAL).
import { resolve } from "node:path";
import { SOCIAL_ACCOUNTS } from "@openlens/config";
import type { LangCode } from "@openlens/config";
import type { Channel } from "@openlens/schemas";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { FileStore, FirestoreStore, type Store } from "./store.js";
import { postOutput, postStory, PLAN, type Row } from "./social.js";

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
const republish = flag("republish"); // post again although a live publication exists (e.g. after re-rendering the video); the old post stays
const user = process.env.USER ?? "cli";

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
const common = { store, assets, storyId, live, approve, republish, user };

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
  const r = await postOutput(common, candidates[0]!.id);
  if (r.outcome === "failed" || r.outcome === "skipped") {
    console.error(`${r.outcome}: ${r.detail}`);
    process.exit(r.outcome === "failed" ? 2 : 3);
  }
  console.log(JSON.stringify(r.publication, null, 2));
} else {
  const langs = opt("langs")?.split(",").map((s) => s.trim()).filter(Boolean);
  const channel = opt("channel");
  const shown = langs ?? [...new Set(rec0.outputs.filter((o) => PLAN.some((p) => p.channel === o.channel && p.kind === o.kind)).map((o) => o.lang))].sort();
  console.error(`${live ? "LIVE" : "dry run"}: ${storyId}  languages ${shown.join(", ")}  channels ${PLAN.filter((p) => !channel || p.channel === channel).map((p) => p.channel).join(", ")}${live && !approve ? "  (no --approve: only already-approved posts)" : ""}\n`);
  const rows = await postStory({
    ...common, langs, channel,
    onRow: (r) => {
      const acct = SOCIAL_ACCOUNTS[r.lang as LangCode]?.[r.channel as "youtube" | "instagram" | "facebook"] as { handle?: string; name?: string; pending?: boolean } | undefined;
      console.error(`${r.channel.padEnd(10)} ${r.lang.padEnd(4)} ${(acct?.handle ?? acct?.name ?? "").padEnd(18)} ${r.outcome.padEnd(11)} ${r.detail}${acct?.pending ? "  (account not created yet)" : ""}`);
    },
  });
  const n = (o: Row["outcome"]) => rows.filter((r) => r.outcome === o).length;
  console.error(`\n${n("published") + n("dry-run ok")} ${live ? "published" : "ok (dry run)"}, ${n("skipped")} skipped, ${n("failed")} failed`);
  console.log(JSON.stringify(rows.map(({ publication: _p, ...r }) => r), null, 2));
  if (n("failed")) process.exit(2);
}
