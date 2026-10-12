import {
  buildChannelPackage, buildScript, localizeScript, runPipeline, scriptId,
  type PipelineState, type Stage,
} from "@openlens/agents";
import { CHANNEL_PLAN, isLang } from "@openlens/config";
import { renderCarouselSlides, renderScriptMedia } from "@openlens/media-worker";
import type { CarouselPayload, OutputRecord, ScriptPayload, Tier } from "@openlens/schemas";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AssetStore } from "./assets.js";
import { emit } from "./bus.js";
import type { StoryRecord, Store } from "./store.js";

export interface Deps {
  store: Store;
  assets: AssetStore;
  workDir: string;
  presenterImages?: Record<string, string>;
}

const running = new Map<string, Promise<void>>();
const now = () => new Date().toISOString();

/** Serialize jobs per story (in-process queue; Cloud Tasks in prod — see plan §10). */
function enqueue(storyId: string, fn: () => Promise<void>): Promise<void> {
  const prev = running.get(storyId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  running.set(storyId, next.finally(() => { if (running.get(storyId) === next) running.delete(storyId); }));
  return next;
}
export const isRunning = (id: string) => running.has(id);

function toState(rec: StoryRecord): PipelineState {
  return {
    story: rec.story, sources: rec.sources, claims: rec.claims, lanes: rec.lanes, context: rec.context,
    timeline: rec.timeline, assessment: rec.assessment, outputs: rec.outputs, qaFlags: rec.qaFlags,
    grounded: rec.grounded, claimsDropped: rec.claimsDropped,
  };
}

async function patch(deps: Deps, id: string, fn: (r: StoryRecord) => StoryRecord | void) {
  const rec = await deps.store.get(id);
  if (!rec) throw new Error(`story ${id} not found`);
  const next = fn(rec) ?? rec;
  next.story.updatedAt = now();
  await deps.store.put(next);
  return next;
}

export type JobStage = Stage | "media";

export function runStory(deps: Deps, storyId: string, stages?: JobStage[]): Promise<void> {
  return enqueue(storyId, async () => {
    const rec = await deps.store.get(storyId);
    if (!rec) throw new Error(`story ${storyId} not found`);
    const agentStages = stages?.filter((s): s is Stage => s !== "media");
    if (!stages || agentStages!.length) {
      rec.story.status = "researching";
      await deps.store.put(rec);
      const state = toState(rec);
      await runPipeline(state, {
        save: async (s) => {
          await patch(deps, storyId, (r) => ({ ...r, ...s, story: s.story }));
        },
        emit: (e) => emit(storyId, { type: "stage", ...e }),
        recordRun: async (run) => {
          await patch(deps, storyId, (r) => ({ ...r, runs: [...r.runs, run] }));
        },
      }, agentStages && agentStages.length ? agentStages : undefined);
    }
    if (!stages || stages.includes("media")) await renderMedia(deps, storyId);
  });
}

async function uploadDir(assets: AssetStore, dir: string, keyPrefix: string) {
  for (const f of await readdir(dir)) await assets.put(join(dir, f), `${keyPrefix}/${f}`, f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
}

/** Render narrated video + audio for every script (or only the given script ids). */
export async function renderMedia(deps: Deps, storyId: string, onlyScripts?: string[], opts: { langs?: string[]; aspects?: ("9:16" | "16:9")[] } = {}) {
  emit(storyId, { type: "stage", stage: "media", status: "started" });
  try {
    const rec = await deps.store.get(storyId);
    if (!rec) throw new Error("story not found");
    const scripts = rec.outputs.filter((o) => o.kind === "script" && (!onlyScripts || onlyScripts.includes(o.id)) && (!opts.langs?.length || opts.langs.includes(o.lang)));
    const made: OutputRecord[] = [];
    const publisher = new Map(rec.sources.map((x) => [x.id, x.publisher]));
    const sourceLabels = Object.fromEntries(
      rec.claims.map((c) => [c.id, [...new Set(c.evidence.map((e) => publisher.get(e.sourceId)).filter((x): x is string => Boolean(x)))]]),
    );
    for (const s of scripts) {
      const sfx = `${s.tier ?? "national"}-${s.lang}`;
      const script = s.payload as unknown as ScriptPayload;
      const r = await renderScriptMedia({
        key: sfx, lang: s.lang, script, outDir: join(deps.workDir, storyId),
        aspects: opts.aspects ?? ["9:16", "16:9"], silent: process.env.MEDIA_SILENT === "1",
        presenterImagePath: deps.presenterImages?.[script.presenter],
        sourceLabels,
      });
      const base = `${storyId}/${sfx}/v${rec.story.version}`;
      const captionsUrl = await deps.assets.put(r.captionsVtt, `${base}/captions.vtt`, "text/vtt");
      const common = { storyId, lang: s.lang, tier: s.tier, claimIds: s.claimIds, ledgerVersion: rec.story.version,
        status: "draft" as const, aiDisclosure: true, dependsOn: [s.id], createdAt: now(), updatedAt: now() };
      for (const v of r.videos) {
        const tag = v.aspect === "9:16" ? "916" : "169";
        const mp4Url = await deps.assets.put(v.mp4, `${base}/video-${tag}.mp4`, "video/mp4");
        const thumbnailUrl = await deps.assets.put(v.thumbnail, `${base}/thumb-${tag}.png`, "image/png");
        let hlsUrl: string | undefined;
        if (v.hls) {
          const hlsDir = v.hls.replace(/\/index\.m3u8$/, "");
          await uploadDir(deps.assets, hlsDir, `${base}/hls-${tag}`);
          hlsUrl = deps.assets.localPath(mp4Url) ? `/assets/${base}/hls-${tag}/index.m3u8` : mp4Url.replace(/video-\d+\.mp4$/, `hls-${tag}/index.m3u8`);
        }
        made.push({ ...common, id: `video-${sfx}-${tag}`, kind: "video", channel: "app",
          payload: { aspect: v.aspect, mp4Url, hlsUrl, captionsVttUrl: captionsUrl, thumbnailUrl, durationSeconds: v.durationSeconds, scriptOutputId: s.id } });
      }
      if (process.env.MEDIA_SILENT !== "1") {
        const audioUrl = await deps.assets.put(r.audio.path, `${base}/narration.m4a`, "audio/mp4");
        made.push({ ...common, id: `audio-${sfx}`, kind: "audio", channel: "app",
          payload: { audioUrl, transcript: r.audio.transcript, durationSeconds: r.audio.durationSeconds, scriptOutputId: s.id } });
      }
      // Instagram carousels need rendered slide images.
      const car = rec.outputs.find((o) => o.id === `carousel-${sfx}`);
      if (car) {
        const payload = car.payload as unknown as CarouselPayload;
        const files = await renderCarouselSlides(payload.slides, s.lang, script.title, join(deps.workDir, storyId, sfx, "carousel"));
        const urls = await Promise.all(files.map((f, i) => deps.assets.put(f, `${base}/carousel/slide-${i + 1}.png`, "image/png")));
        made.push({ ...car, updatedAt: now(), payload: { ...payload, slides: payload.slides.map((sl, i) => ({ ...sl, imageUrl: urls[i] })) } });
      }
      emit(storyId, { type: "stage", stage: "media", status: "started", detail: `rendered ${sfx}` });
    }
    await patch(deps, storyId, (r) => {
      const byId = new Map(r.outputs.map((o) => [o.id, o]));
      for (const o of made) byId.set(o.id, { ...o, createdAt: byId.get(o.id)?.createdAt ?? o.createdAt });
      // Channel packages that reference these videos now depend on them too.
      for (const o of byId.values()) {
        const vid = (o.payload as { videoOutputId?: string }).videoOutputId;
        if (vid && byId.has(vid) && !o.dependsOn.includes(vid)) o.dependsOn = [...o.dependsOn, vid];
      }
      r.outputs = [...byId.values()];
    });
    emit(storyId, { type: "stage", stage: "media", status: "done" });
  } catch (err) {
    emit(storyId, { type: "stage", stage: "media", status: "failed", detail: String(err).slice(0, 300) });
    throw err;
  }
}

/**
 * Regenerate one output family after a correction: rebuild the script for its
 * language/tier from the current ledger, then its channel package and media.
 */
export function regenerate(deps: Deps, storyId: string, outputId: string): Promise<void> {
  return enqueue(storyId, async () => {
    const rec = await deps.store.get(storyId);
    if (!rec?.assessment) throw new Error("story has no assessment");
    const out = rec.outputs.find((o) => o.id === outputId);
    if (!out) throw new Error(`output ${outputId} not found`);
    if (!isLang(out.lang)) throw new Error(`unsupported language ${out.lang}`);
    const lang = out.lang;
    const tier = (out.tier ?? CHANNEL_PLAN[lang].tier) as Tier;
    const presenter = CHANNEL_PLAN[lang].presenter;
    emit(storyId, { type: "stage", stage: "scripts", status: "started", detail: `regenerating ${tier}-${lang}` });

    const base = await buildScript(rec.assessment, rec.claims, CHANNEL_PLAN.en.presenter);
    const script = lang === "en" ? { ...base.script, presenter } : (await localizeScript(base.script, lang, presenter)).script;
    const sid = scriptId(lang, tier);
    const { pkg } = await buildChannelPackage(storyId, script, lang, tier, rec.sources, rec.claims);
    const sfx = `${tier}-${lang}`;
    const claimIds = [...new Set(script.lines.flatMap((l) => l.claimIds))];
    const mk = (id: string, kind: OutputRecord["kind"], channel: OutputRecord["channel"], payload: object, dependsOn: string[]): OutputRecord => ({
      id, storyId, kind, channel, lang, tier, claimIds, ledgerVersion: rec.story.version, status: "draft",
      payload: payload as Record<string, unknown>, aiDisclosure: true, dependsOn, createdAt: now(), updatedAt: now(),
    });
    const fresh = [
      mk(sid, "script", "app", script, []),
      mk(`yt-${sfx}`, "yt_meta", "youtube", { ...pkg.yt, videoOutputId: `video-${sfx}-916` }, [sid]),
      mk(`x-${sfx}`, "x_thread", "x", { ...pkg.x, videoOutputId: `video-${sfx}-916` }, [sid]),
      mk(`ig-${sfx}`, "ig_reel", "instagram", { ...pkg.ig, videoOutputId: `video-${sfx}-916` }, [sid]),
      mk(`carousel-${sfx}`, "carousel", "instagram", pkg.carousel, [sid]),
      mk(`fb-${sfx}`, "fb_post", "facebook", { ...pkg.fb, videoOutputId: `video-${sfx}-916` }, [sid]),
      mk(`wa-${sfx}`, "wa_digest", "whatsapp", pkg.wa, [sid]),
    ];
    await patch(deps, storyId, (r) => {
      const byId = new Map(r.outputs.map((o) => [o.id, o]));
      for (const o of fresh) byId.set(o.id, { ...o, createdAt: byId.get(o.id)?.createdAt ?? o.createdAt });
      r.outputs = [...byId.values()];
    });
    emit(storyId, { type: "stage", stage: "scripts", status: "done", detail: `regenerated ${sfx}` });
    await renderMedia(deps, storyId, [sid]);
  });
}
