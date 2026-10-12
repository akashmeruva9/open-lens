// Free motion preview (no AI calls, silent): composites the presenter idle clip with the layouts into .data/preview/video/.
//   node --import tsx src/previewvideo.ts [lang=en] [aspect=16:9]
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { AI_DISCLOSURE, CHANNEL_PLAN, PRESENTERS, isLang } from "@openlens/config";
import { fontFor, registerDefaultFonts } from "./fonts.js";
import { renderVideo } from "./render.js";
import { loadPresenter, type Aspect, type Scene } from "./scenes.js";

registerDefaultFonts();
const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const lang = process.argv[2] ?? "en";
const aspect = (process.argv[3] ?? "16:9") as Aspect;
if (!isLang(lang)) throw new Error(`unknown language ${lang}`);
const rec = JSON.parse(readFileSync(`${ROOT}/.data/stories/sample-metro-fare.json`, "utf8"));
const script = rec.outputs.find((o: any) => o.kind === "script" && o.lang === lang);
const pid = CHANNEL_PLAN[lang].presenter;
const clip = `${ROOT}/data/presenters/${pid}.idle.mp4`;
if (!existsSync(clip)) throw new Error(`no idle clip yet: ${clip}`);
const pub = new Map(rec.sources.map((s: any) => [s.id, s.publisher]));
const scenes: Scene[] = script.payload.lines.map((l: any, i: number, a: any[]) => ({
  label: l.label, text: l.text, claimIds: l.claimIds, seconds: 4,
  sources: [...new Set(l.claimIds.flatMap((id: string) => rec.claims.find((c: any) => c.id === id)?.evidence.map((e: any) => pub.get(e.sourceId)) ?? []))].slice(0, 2),
  layout: i === 0 || i === a.length - 1 || i % 2 === 0 ? "anchor" : "split",
}));
const outDir = `${ROOT}/.data/preview/video`;
mkdirSync(outDir, { recursive: true });
const brand = { title: script.payload.title, disclosure: AI_DISCLOSURE[lang]!, fontFamily: fontFor(lang), lang, presenterName: PRESENTERS[pid].name, presenterImage: await loadPresenter(`${ROOT}/data/presenters/${pid}.png`), presenterVideo: clip };
const t0 = Date.now();
const r = await renderVideo({ outDir, name: `${lang}-${aspect === "16:9" ? "169" : "916"}`, scenes, brand, aspect });
console.log(`${r.mp4} (${r.durationSeconds}s) rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
