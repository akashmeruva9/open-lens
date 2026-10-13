// Shared by `seed` and `story`: create (or reuse) a story from a source pack and run the pipeline.
import { languagesFor } from "@openlens/config";
import { SourceRecord, type Story } from "@openlens/schemas";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { LocalAssets } from "./assets.js";
import { subscribe } from "./bus.js";
import { runStory, type JobStage } from "./jobs.js";
import { emptyRecord, type Store } from "./store.js";

export async function runSeed(opts: { dir: string; dataDir: string; store: Store; stages?: JobStage[] }): Promise<{ storyId: string }> {
  const { dir, dataDir, store, stages } = opts;
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
  await runStory({ store, assets: new LocalAssets(`${dataDir}/assets`), workDir: `${dataDir}/work` }, id, stages);
  const r = (await store.get(id))!;
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${r.claims.length} claims, ${r.outputs.length} outputs, ${r.qaFlags.length} QA flags, ${r.runs.length} model runs`);
  return { storyId: id };
}
