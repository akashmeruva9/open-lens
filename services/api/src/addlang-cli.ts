// Add one language to an existing story without touching its other scripts/videos:
//   npm run add-lang -w @openlens/api -- <storyId> <lang> [--no-render]
// Localizes the story's existing English script into <lang>, builds that language's channel packages, then renders
// only that language's video. The English script, videos and approvals are left exactly as they are.
import { buildChannelPackage, localizeScript, scriptId } from "@openlens/agents";
import { CHANNEL_PLAN, isLang } from "@openlens/config";
import type { OutputRecord, ScriptPayload } from "@openlens/schemas";
import { resolve } from "node:path";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { renderMedia } from "./jobs.js";
import { FileStore, FirestoreStore, type Store } from "./store.js";

const DATA_DIR = resolve(process.env.DATA_DIR ?? `${resolve(import.meta.dirname, "../../..")}/.data`);
const WORK_DIR = resolve(process.env.WORK_DIR ?? `${DATA_DIR}/work`);
const [storyId, lang] = process.argv.slice(2);
if (!storyId || !lang || !isLang(lang) || lang === "en") {
  console.error("usage: add-lang <storyId> <lang (not en)> [--no-render]");
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
const rec = await store.get(storyId);
if (!rec) throw new Error(`story not found: ${storyId}`);

const plan = CHANNEL_PLAN[lang];
const sid = scriptId(lang, plan.tier);
if (process.argv.includes("--render-only")) {
  if (!rec.outputs.some((o) => o.id === sid)) throw new Error(`${sid} does not exist yet; run without --render-only first`);
  await renderMedia({ store, assets, workDir: WORK_DIR }, storyId, [sid], { langs: [lang] });
  for (const o of (await store.get(storyId))!.outputs.filter((x) => x.kind === "video" && x.lang === lang)) console.log(o.id, o.status, (o.payload as { mp4Url?: string }).mp4Url);
  process.exit(0);
}
if (rec.outputs.some((o) => o.id === sid)) throw new Error(`${sid} already exists; use --render-only to (re)render it`);
const en = rec.outputs.find((o) => o.kind === "script" && o.lang === "en");
if (!en) throw new Error("story has no English script to localize from");

const now = () => new Date().toISOString();
const make = (o: Pick<OutputRecord, "id" | "kind" | "channel" | "claimIds" | "payload"> & Partial<OutputRecord>): OutputRecord => ({
  storyId, ledgerVersion: rec.story.version, status: "draft", aiDisclosure: true, dependsOn: [], createdAt: now(), updatedAt: now(), lang, tier: plan.tier, ...o,
});

console.error(`localizing ${en.id} -> ${lang} (${plan.presenter})`);
const loc = await localizeScript(en.payload as unknown as ScriptPayload, lang, plan.presenter);
const script = loc.script;
const claimIds = [...new Set(script.lines.flatMap((l) => l.claimIds))];
const scriptOut = make({ id: sid, kind: "script", channel: "app", claimIds, payload: script });

console.error("building channel packages");
const pkg = await buildChannelPackage(storyId, script, lang, plan.tier, rec.sources, rec.claims);
const sfx = `${plan.tier}-${lang}`;
const common = { claimIds, dependsOn: [sid] };
const video = `video-${sfx}-916`;
const made = [
  scriptOut,
  make({ id: `yt-${sfx}`, kind: "yt_meta", channel: "youtube", ...common, payload: { ...pkg.pkg.yt, videoOutputId: video } }),
  make({ id: `x-${sfx}`, kind: "x_thread", channel: "x", ...common, payload: { ...pkg.pkg.x, videoOutputId: video } }),
  make({ id: `ig-${sfx}`, kind: "ig_reel", channel: "instagram", ...common, payload: { ...pkg.pkg.ig, videoOutputId: video } }),
  make({ id: `carousel-${sfx}`, kind: "carousel", channel: "instagram", ...common, payload: pkg.pkg.carousel }),
  make({ id: `fb-${sfx}`, kind: "fb_post", channel: "facebook", ...common, payload: { ...pkg.pkg.fb, videoOutputId: video } }),
  make({ id: `wa-${sfx}`, kind: "wa_digest", channel: "whatsapp", ...common, payload: pkg.pkg.wa }),
];
const fresh = (await store.get(storyId))!;
fresh.outputs = [...fresh.outputs, ...made];
if (!fresh.story.languages.includes(lang)) fresh.story.languages = [...fresh.story.languages, lang];
await store.put(fresh);
console.error(`saved ${made.length} outputs`);

if (process.argv.includes("--no-render")) process.exit(0);
console.error("rendering video (this takes a few minutes)");
await renderMedia({ store, assets, workDir: WORK_DIR }, storyId, [sid], { langs: [lang] });
const done = (await store.get(storyId))!;
for (const o of done.outputs.filter((x) => x.kind === "video" && x.lang === lang)) console.log(o.id, o.status, (o.payload as { mp4Url?: string }).mp4Url);
