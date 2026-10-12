// Usage:
//   npm run seed -w @openlens/api -- --fixture            load data/fixtures/story-bundle.json (instant, no AI)
//   npm run seed -w @openlens/api -- [storyDir] [--stages a,b]  create a story from a source pack and run the live pipeline
import { languagesFor } from "@openlens/config";
import { SourceRecord, type Story, type StoryBundle } from "@openlens/schemas";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { LocalAssets } from "./assets.js";
import { subscribe } from "./bus.js";
import { runStory } from "./jobs.js";
import { emptyRecord, FileStore } from "./store.js";

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
  const sources = z.array(SourceRecord).parse(JSON.parse(await readFile(`${dir}/sources.json`, "utf8")));
  const meta = JSON.parse(await readFile(`${dir}/story.json`, "utf8").catch(() => "{}")) as Partial<Story>;
  const id = sources[0]!.storyId;
  const t = new Date().toISOString();
  if (!(await store.get(id)) || !stages) {
    const rec = emptyRecord({
      id, title: meta.title ?? sources[0]!.title, summary: "", region: meta.region ?? "IN", topics: meta.topics ?? [],
      languages: meta.languages ?? languagesFor([meta.region ?? "APAC"]), riskTier: "low", status: "draft", version: 1, createdAt: t, updatedAt: t,
    });
    rec.sources = sources;
    await store.put(rec);
  }
  subscribe(id, (m) => console.log(new Date().toISOString().slice(11, 19), JSON.stringify(m)));
  const t0 = Date.now();
  await runStory({ store, assets: new LocalAssets(`${DATA_DIR}/assets`), workDir: `${DATA_DIR}/work` }, id, stages);
  const r = (await store.get(id))!;
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${r.claims.length} claims, ${r.outputs.length} outputs, ${r.qaFlags.length} QA flags, ${r.runs.length} model runs`);
}
