// Publish one stored output to a channel (dry-run by default):
//   npm run publish -w @openlens/api -- <storyId> --lang ja [--channel youtube] [--live] [--approve]
//
// Dry-run never writes anything: the output is treated as approved in memory only and the publisher prints the
// requests it would send. --live uploads for real and needs --approve (or an already approved output) so a
// person has signed off. Credentials come from the environment (YOUTUBE_* in ~/.openlens/youtube.env).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_WEB_URL } from "@openlens/config";
import type { Channel, OutputRecord } from "@openlens/schemas";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { FileStore, FirestoreStore, type Store } from "./store.js";
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
const lang = opt("lang");
const channel = (opt("channel") ?? "youtube") as Channel;
const live = flag("live");
if (!storyId || storyId.startsWith("--") || !lang) {
  console.error("usage: publish <storyId> --lang <lang> [--channel youtube] [--live] [--approve]");
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
const candidates = rec.outputs.filter((o) => o.channel === channel && o.lang === lang && o.kind !== "video");
if (!candidates.length) throw new Error(`no ${channel} output for ${storyId} in "${lang}" (found: ${[...new Set(rec.outputs.map((o) => `${o.channel}/${o.lang}`))].join(", ")})`);
if (candidates.length > 1) throw new Error(`several ${channel}/${lang} outputs: ${candidates.map((o) => o.id).join(", ")}`);
let output: OutputRecord = candidates[0]!;

if (live) {
  if (output.status !== "approved" && !flag("approve")) throw new Error(`${output.id} is "${output.status}": review it, then rerun with --approve to sign off and publish live`);
  if (output.status !== "approved") {
    output = { ...output, status: "approved", approvedBy: process.env.USER ?? "cli", ledgerVersion: rec.story.version, updatedAt: new Date().toISOString() };
    rec.outputs = rec.outputs.map((o) => (o.id === output.id ? output : o));
    await store.put(rec);
    console.error(`approved ${output.id}`);
  }
} else if (output.status !== "approved" && output.status !== "published") {
  output = { ...output, status: "approved" }; // in memory only
  console.error(`dry run: treating ${output.id} as approved in memory (nothing is saved)`);
}

const pub = await publisher();
if (!pub) throw new Error("@openlens/publisher is not built: npm run build -w @openlens/publisher");
const ctx: PublishContext = {
  approvedBy: process.env.USER ?? "cli",
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
const p = pub.getPublisher(channel);
const v = await p.validate(output, ctx);
for (const w of v.warnings) console.error(`warning: ${w}`);
if (!v.ok) {
  console.error(`validation failed:\n - ${v.errors.join("\n - ")}`);
  process.exit(2);
}
const publication = await p.publish(output, ctx, { mode: live ? "live" : "dry_run" });
if (live) {
  const fresh = (await store.get(storyId))!;
  fresh.publications = [...fresh.publications, publication];
  if (publication.status === "published") fresh.outputs = fresh.outputs.map((o) => (o.id === output.id ? { ...o, status: "published", updatedAt: new Date().toISOString() } : o));
  await store.put(fresh);
}
console.log(JSON.stringify(publication, null, 2));
