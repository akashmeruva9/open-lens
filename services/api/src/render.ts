// Render narrated videos for any stored story, in any languages and shapes.
//   npm run render -w @openlens/api -- <storyId> [--langs en,hi,te] [--aspects 9:16,16:9] [--list]
// Narration is cached, so re-running after a layout change costs nothing; only new/changed text is synthesized.
import { resolve } from "node:path";
import { LocalAssets } from "./assets.js";
import { renderMedia } from "./jobs.js";
import { FileStore } from "./store.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const DATA_DIR = resolve(process.env.DATA_DIR ?? `${ROOT}/.data`);
const store = new FileStore(DATA_DIR);
const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

if (args.includes("--list") || !args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--langs" && args[args.indexOf(a) - 1] !== "--aspects")) {
  for (const s of await store.listStories()) console.log(`${s.id}  [${s.languages.join(",")}]  ${s.title}`);
  process.exit(0);
}
const storyId = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--langs" && args[args.indexOf(a) - 1] !== "--aspects")!;
const rec = await store.get(storyId);
if (!rec) throw new Error(`story not found: ${storyId} (try --list)`);
const langs = flag("--langs")?.split(",").filter(Boolean);
const aspects = flag("--aspects")?.split(",").filter(Boolean) as ("9:16" | "16:9")[] | undefined;
const have = new Set(rec.outputs.filter((o) => o.kind === "script").map((o) => o.lang));
const missing = (langs ?? []).filter((l) => !have.has(l));
if (missing.length) throw new Error(`no script for: ${missing.join(", ")}. Available: ${[...have].join(", ")}. Run the seed/pipeline scripts stage for those languages first.`);

const t0 = Date.now();
await renderMedia({ store, assets: new LocalAssets(`${DATA_DIR}/assets`), workDir: `${DATA_DIR}/work` }, storyId, undefined, { langs, aspects });
console.log(`rendered ${storyId} [${(langs ?? [...have]).join(",")}] in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${DATA_DIR}/assets/${storyId}/`);
