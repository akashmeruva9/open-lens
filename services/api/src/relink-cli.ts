// Rewrite text in stored, unpublished channel posts:
//   npm run relink -w @openlens/api -- [--from https://openlens.app] [--apply]            story links -> PUBLIC_WEB_URL
//   npm run relink -w @openlens/api -- --replace "<old text>" "<new text>" [--apply]      any other exact text
// Dry run by default (prints what would change). Scripts, videos and anything already published keep their text.
// For links, the new base is PUBLIC_WEB_URL (set OPENLENS_PUBLIC_URL).
import { PUBLIC_WEB_URL } from "@openlens/config";
import { resolve } from "node:path";
import { FileStore, FirestoreStore, type Store } from "./store.js";

const DATA_DIR = resolve(process.env.DATA_DIR ?? `${resolve(import.meta.dirname, "../../..")}/.data`);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fromIdx = args.indexOf("--from");
const replIdx = args.indexOf("--replace");
const from = (fromIdx > -1 ? args[fromIdx + 1]! : "https://openlens.app").replace(/\/+$/, "");
// [old, new] pairs applied to every candidate output's payload
const rules: [string, string][] = replIdx > -1 ? [[args[replIdx + 1]!, args[replIdx + 2]!]] : [[`${from}/story/`, `${PUBLIC_WEB_URL}/story/`]];
if (replIdx > -1 && (!rules[0]![0] || rules[0]![1] === undefined)) throw new Error('usage: --replace "<old text>" "<new text>"');
if (replIdx === -1 && from === PUBLIC_WEB_URL) throw new Error(`nothing to do: PUBLIC_WEB_URL is already ${from} (set OPENLENS_PUBLIC_URL to the real site first)`);

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
console.log(`${apply ? "rewriting" : "dry run:"} ${rules.map(([a, b]) => `"${a}" -> "${b}"`).join(", ")}`);
let total = 0;
for (const s of await store.listStories()) {
  const rec = await store.get(s.id);
  if (!rec) continue;
  const changed: string[] = [];
  rec.outputs = rec.outputs.map((o) => {
    if (o.kind === "script" || o.kind === "video" || o.kind === "audio" || o.status === "published") return o;
    const text = JSON.stringify(o.payload);
    const esc = (t: string) => JSON.stringify(t).slice(1, -1); // match inside the JSON text
    const hit = rules.filter(([a]) => text.includes(esc(a)));
    if (!hit.length) return o;
    changed.push(o.id);
    return { ...o, payload: JSON.parse(hit.reduce((t, [a, b]) => t.split(esc(a)).join(esc(b)), text)) };
  });
  if (!changed.length) continue;
  total += changed.length;
  console.log(`${s.id.slice(0, 60)}: ${changed.length} outputs (${changed.join(", ")})`);
  if (apply) await store.put(rec);
}
console.log(`${total} outputs ${apply ? "updated" : "would change; rerun with --apply"}`);
