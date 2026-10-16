// Rewrite story links in stored channel posts that still point at a placeholder domain:
//   npm run relink -w @openlens/api -- [--from https://openlens.app] [--apply]
// Dry run by default (prints what would change). Only unpublished channel outputs are touched; scripts and
// anything already published keep their text. The new base is PUBLIC_WEB_URL (set OPENLENS_PUBLIC_URL).
import { PUBLIC_WEB_URL } from "@openlens/config";
import { resolve } from "node:path";
import { FileStore, FirestoreStore, type Store } from "./store.js";

const DATA_DIR = resolve(process.env.DATA_DIR ?? `${resolve(import.meta.dirname, "../../..")}/.data`);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fromIdx = args.indexOf("--from");
const from = (fromIdx > -1 ? args[fromIdx + 1]! : "https://openlens.app").replace(/\/+$/, "");
if (from === PUBLIC_WEB_URL) throw new Error(`nothing to do: PUBLIC_WEB_URL is already ${from} (set OPENLENS_PUBLIC_URL to the real site first)`);

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

const store = await makeStore();
console.log(`${apply ? "rewriting" : "dry run:"} ${from}/story/ -> ${PUBLIC_WEB_URL}/story/`);
let total = 0;
for (const s of await store.listStories()) {
  const rec = await store.get(s.id);
  if (!rec) continue;
  const changed: string[] = [];
  rec.outputs = rec.outputs.map((o) => {
    if (o.kind === "script" || o.kind === "video" || o.kind === "audio" || o.status === "published") return o;
    const text = JSON.stringify(o.payload);
    if (!text.includes(`${from}/story/`)) return o;
    changed.push(o.id);
    return { ...o, payload: JSON.parse(text.split(`${from}/story/`).join(`${PUBLIC_WEB_URL}/story/`)) };
  });
  if (!changed.length) continue;
  total += changed.length;
  console.log(`${s.id.slice(0, 60)}: ${changed.length} outputs (${changed.join(", ")})`);
  if (apply) await store.put(rec);
}
console.log(`${total} outputs ${apply ? "updated" : "would change; rerun with --apply"}`);
