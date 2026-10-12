// Free layout preview (no AI calls): renders one scene per language in both shapes into .data/preview/.
//   node --import tsx src/preview.ts
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { AI_DISCLOSURE, PRESENTERS, CHANNEL_PLAN } from "@openlens/config";
import { registerDefaultFonts, fontFor } from "./fonts.js";
import { renderSceneFrame, loadPresenter } from "./scenes.js";
registerDefaultFonts();
const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const rec = JSON.parse(readFileSync(`${ROOT}/.data/stories/sample-metro-fare.json`, "utf8"));
const pub = new Map(rec.sources.map((s: any) => [s.id, s.publisher]));
const src = (ids: string[]) => [...new Set(ids.flatMap((id) => rec.claims.find((c: any) => c.id === id)?.evidence.map((e: any) => pub.get(e.sourceId)) ?? []))].slice(0, 2) as string[];
const out = `${ROOT}/.data/preview`; mkdirSync(out, { recursive: true });
for (const lang of ["en", "hi", "te", "ja"] as const) {
  const sc = rec.outputs.find((o: any) => o.kind === "script" && o.lang === lang);
  const pid = CHANNEL_PLAN[lang].presenter;
  const brand = { title: sc.payload.title, disclosure: AI_DISCLOSURE[lang]!, fontFamily: fontFor(lang), lang, presenterName: PRESENTERS[pid].name, presenterImage: await loadPresenter(`${ROOT}/data/presenters/${pid}.png`) };
  const lines = sc.payload.lines; const i = Math.min(1, lines.length - 1);
  for (const aspect of ["16:9", "9:16"] as const) {
    const l = lines[i];
    writeFileSync(`${out}/${lang}-${aspect === "16:9" ? "169" : "916"}.png`, renderSceneFrame({ label: l.label, text: l.text, claimIds: l.claimIds, seconds: 5, sources: src(l.claimIds) }, brand, i, lines.length, aspect));
  }
}
console.log("done");
