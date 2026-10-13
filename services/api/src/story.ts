// One command: links in, narrated videos out.
//   npm run story -w @openlens/api -- <story-id> <market> "<title>" <url> [url...] [--langs en,hi,te] [--intake-only]
//   market: JP, KR, IN-TG, APAC ...   urls: allowlisted outlets (data/sources/allowlist.json) incl. one primary document
// Steps: intake sources -> claims/evidence -> scripts per language -> narrated 9:16 + 16:9 videos -> hand-off manifest.
import { Allowlist, intakeUrl } from "@openlens/agents";
import { languagesFor } from "@openlens/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRenderedAssets } from "./handoff.js";
import { runSeed } from "./seedlib.js";
import { FileStore } from "./store.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const DATA_DIR = resolve(process.env.DATA_DIR ?? `${ROOT}/.data`);
const raw = process.argv.slice(2);
const flag = (n: string) => (raw.includes(n) ? raw[raw.indexOf(n) + 1] : undefined);
const positional = raw.filter((a, i) => !a.startsWith("--") && raw[i - 1] !== "--langs");
const [storyId, region, title, ...urls] = positional;
if (!storyId || !region || !title || !urls.length) {
  console.error('usage: story <story-id> <market> "<title>" <url> [url...] [--langs en,hi,te] [--intake-only]');
  process.exit(1);
}

const { entries } = Allowlist.parse(JSON.parse(await readFile(`${ROOT}/data/sources/allowlist.json`, "utf8")));
const sources = [];
for (const [i, url] of urls.entries()) {
  const r = await intakeUrl(url, storyId, `s${i + 1}`, entries);
  if (r.source) {
    sources.push(r.source);
    console.log(`ok  s${i + 1} ${r.source.publisher} [${r.source.language}, ${r.source.sourceType}, ${r.source.lens.rating}] ${r.source.text.length} chars`);
  } else console.warn(`rejected ${url}: ${r.rejected}`);
}
if (!sources.length) throw new Error("no usable sources (are the outlets in data/sources/allowlist.json?)");
if (!sources.some((s) => s.sourceType === "primary")) console.warn("! no primary document: claims can only reach 'supported' through independent corroboration");

const langs = flag("--langs")?.split(",").filter(Boolean) ?? languagesFor([region]);
const dir = `${ROOT}/data/seed/${storyId}`;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/sources.json`, JSON.stringify(sources, null, 2));
await writeFile(`${dir}/story.json`, JSON.stringify({ title, region, topics: [], languages: langs }, null, 2));
console.log(`sources saved to ${dir}; languages: ${langs.join(",")}`);
if (raw.includes("--intake-only")) process.exit(0);

const store = new FileStore(DATA_DIR);
await runSeed({ dir, dataDir: DATA_DIR, store });
const assets = buildRenderedAssets((await store.get(storyId))!);
await mkdir(`${DATA_DIR}/assets/${storyId}`, { recursive: true });
await writeFile(`${DATA_DIR}/assets/${storyId}/manifest.json`, JSON.stringify(assets, null, 2));
console.log(`\n${assets.length} videos ready -> ${DATA_DIR}/assets/${storyId}/  (manifest.json lists them)`);
console.log(`Re-render later or add languages: npm run render -w @openlens/api -- ${storyId} --langs ${langs.join(",")}`);
