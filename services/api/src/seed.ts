// Usage:
//   npm run seed -w @openlens/api -- --fixture            load data/fixtures/story-bundle.json (instant, no AI)
//   npm run seed -w @openlens/api -- [storyDir] [--stages a,b]  create a story from a source pack and run the live pipeline
import { type StoryBundle } from "@openlens/schemas";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSeed } from "./seedlib.js";
import { FileStore } from "./store.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const DATA_DIR = resolve(process.env.DATA_DIR ?? `${ROOT}/.data`);
const store = new FileStore(DATA_DIR);
const args = process.argv.slice(2);

if (args.includes("--fixture")) {
  const b = JSON.parse(await readFile(`${ROOT}/data/fixtures/story-bundle.json`, "utf8")) as StoryBundle;
  await store.put({ ...b, qaFlags: [], runs: [], grounded: false, claimsDropped: 0 });
  console.log(`seeded fixture story ${b.story.id} into ${DATA_DIR}`);
} else {
  const dir = resolve(ROOT, args.find((a) => !a.startsWith("--")) ?? "data/seed/sample-story");
  const stagesArg = args[args.indexOf("--stages") + 1];
  const stages = args.includes("--stages") ? (stagesArg!.split(",") as never) : undefined;
  await runSeed({ dir, dataDir: DATA_DIR, store, stages });
}
