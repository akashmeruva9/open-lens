// Build a story source pack from allowlisted URLs.
// Usage: npm run intake -w @openlens/agents -- <story-id> <region> "<title>" <url> [url...]
//   region: market code (JP, KR, IN-TG, APAC…). Writes data/seed/<story-id>/{sources.json,story.json}.
import { languagesFor } from "@openlens/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Allowlist, intakeUrl } from "./intake.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const [storyId, region, title, ...urls] = process.argv.slice(2);
if (!storyId || !region || !title || !urls.length) {
  console.error('usage: intake <story-id> <region> "<title>" <url> [url...]');
  process.exit(1);
}
const { entries } = Allowlist.parse(JSON.parse(await readFile(`${ROOT}/data/sources/allowlist.json`, "utf8")));
const sources = [];
for (const [i, url] of urls.entries()) {
  const r = await intakeUrl(url, storyId, `s${i + 1}`, entries);
  if (r.source) {
    sources.push(r.source);
    console.log(`✓ s${i + 1} ${r.source.publisher} [${r.source.language}, ${r.source.sourceType}, ${r.source.lens.rating}] ${r.source.text.length} chars`);
  } else console.warn(`✗ ${url}: ${r.rejected}`);
}
if (!sources.some((s) => s.sourceType === "primary")) console.warn("! no primary document — claims can only reach 'supported' through independent corroboration");
const dir = `${ROOT}/data/seed/${storyId}`;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/sources.json`, JSON.stringify(sources, null, 2));
await writeFile(`${dir}/story.json`, JSON.stringify({ title, region, topics: [], languages: languagesFor([region]) }, null, 2));
console.log(`wrote ${dir} (${sources.length} sources). Next: npm run seed -w @openlens/api -- data/seed/${storyId}`);
