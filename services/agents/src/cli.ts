import { readFile, writeFile, mkdir } from "node:fs/promises";
import { SourceRecord } from "@openlens/schemas";
import { z } from "zod";
import { extractClaims, synthesizeAssessment, validateClaims, citationCoverage } from "./index.js";

const storyDir = process.argv[2];
if (!storyDir) {
  console.error("usage: cli <storyDir with sources.json>");
  process.exit(1);
}
const sources = z
  .array(SourceRecord)
  .parse(JSON.parse(await readFile(`${storyDir}/sources.json`, "utf8")));
const storyId = sources[0]?.storyId ?? "story";

console.log(`Extracting claims from ${sources.length} sources...`);
const { claims, dropped, metas } = await extractClaims(storyId, sources);
console.log(`  ${claims.length} claims kept, ${dropped} dropped (passage not in source)`);
const claimViolations = validateClaims(claims, sources);
if (claimViolations.length) console.warn("  claim violations:", claimViolations);

console.log("Synthesizing assessment...");
const { assessment, violations, meta } = await synthesizeAssessment(storyId, claims, sources);
console.log(`  citation coverage: ${(citationCoverage(assessment, claims) * 100).toFixed(0)}%`);
if (violations.length) console.warn("  assessment violations:", violations);

await mkdir(`${storyDir}/out`, { recursive: true });
await writeFile(`${storyDir}/out/ledger.json`, JSON.stringify({ claims, assessment, runs: [...metas, meta] }, null, 2));
console.log(`Wrote ${storyDir}/out/ledger.json`);
