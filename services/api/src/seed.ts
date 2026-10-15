// Usage:
//   npm run seed -w @openlens/api -- <storyDir> [--stages a,b]   create a story from a source pack and run the live pipeline
// Source packs are written by `npm run intake -w @openlens/agents` (data/seed/<story-id>).
import { resolve } from "node:path";
import { runSeed } from "./seedlib.js";
import { FileStore } from "./store.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const DATA_DIR = resolve(process.env.DATA_DIR ?? `${ROOT}/.data`);
const store = new FileStore(DATA_DIR);
const args = process.argv.slice(2);

const dirArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--stages");
if (!dirArg) {
  console.error("usage: npm run seed -w @openlens/api -- data/seed/<story-id> [--stages a,b]");
  process.exit(1);
}
const dir = resolve(ROOT, dirArg);
const stagesArg = args[args.indexOf("--stages") + 1];
const stages = args.includes("--stages") ? (stagesArg!.split(",") as never) : undefined;
await runSeed({ dir, dataDir: DATA_DIR, store, stages });
