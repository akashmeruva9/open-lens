// Print (and write) the hand-off manifest for a stored story:  npm run handoff -w @openlens/api -- <storyId>
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRenderedAssets } from "./handoff.js";
import { FileStore } from "./store.js";

const DATA_DIR = resolve(process.env.DATA_DIR ?? `${resolve(import.meta.dirname, "../../..")}/.data`);
const storyId = process.argv[2];
if (!storyId) throw new Error("usage: handoff <storyId>");
const rec = await new FileStore(DATA_DIR).get(storyId);
if (!rec) throw new Error(`story not found: ${storyId}`);
const assets = buildRenderedAssets(rec);
await mkdir(`${DATA_DIR}/assets/${storyId}`, { recursive: true });
await writeFile(`${DATA_DIR}/assets/${storyId}/manifest.json`, JSON.stringify(assets, null, 2));
console.log(JSON.stringify(assets, null, 2));
