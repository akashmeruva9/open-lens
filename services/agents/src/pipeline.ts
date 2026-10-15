import { CHANNEL_PLAN, isLang } from "@openlens/config";
import type {
  AgentRun, Assessment, Claim, ContextItem, LensLane, OutputRecord, QaFlag, ScriptPayload,
  SourceRecord, Story, TimelineEvent, Tier,
} from "@openlens/schemas";
import { buildChannelPackage } from "./channels.js";
import { extractClaims } from "./claims.js";
import { corroborate } from "./corroborate.js";
import type { RunMeta } from "./gemini.js";
import { analyzeLenses } from "./lenses.js";
import { qaCheck } from "./qa.js";
import { research } from "./research.js";
import { buildScript, localizeScript } from "./script.js";
import { synthesizeAssessment } from "./synthesis.js";

export const STAGES = ["claims", "corroborate", "lenses", "research", "synthesize", "qa", "scripts", "channels"] as const;
export type Stage = (typeof STAGES)[number];

export interface PipelineState {
  story: Story;
  sources: SourceRecord[];
  claims: Claim[];
  lanes: LensLane[];
  context: ContextItem[];
  timeline: TimelineEvent[];
  assessment: Assessment | null;
  outputs: OutputRecord[];
  qaFlags: QaFlag[];
  grounded: boolean;
  claimsDropped: number;
}

export interface PipelineSink {
  /** Persist the changed parts of the state after each stage. */
  save(state: PipelineState, stage: Stage): Promise<void>;
  emit(e: { stage: Stage; status: "started" | "done" | "failed"; detail?: string }): void;
  recordRun(run: AgentRun): Promise<void>;
}

const now = () => new Date().toISOString();
let runSeq = 0;

function runOf(storyId: string, stage: Stage, m: RunMeta, ok = true, error?: string): AgentRun {
  return {
    id: `run-${Date.now().toString(36)}-${(runSeq++).toString(36)}`,
    storyId, stage, model: m.model, latencyMs: m.latencyMs, promptTokens: m.promptTokens,
    outputTokens: m.outputTokens, ok, error, at: now(),
  };
}

function output(
  state: PipelineState,
  o: Pick<OutputRecord, "id" | "kind" | "channel" | "lang" | "claimIds" | "payload"> & Partial<OutputRecord>,
): OutputRecord {
  return {
    storyId: state.story.id, ledgerVersion: state.story.version, status: "draft", aiDisclosure: true,
    dependsOn: [], createdAt: now(), updatedAt: now(), ...o,
  };
}

function upsertOutputs(state: PipelineState, next: OutputRecord[]) {
  const byId = new Map(state.outputs.map((o) => [o.id, o]));
  for (const o of next) byId.set(o.id, { ...o, createdAt: byId.get(o.id)?.createdAt ?? o.createdAt });
  state.outputs = [...byId.values()];
}

/** Script output id convention shared with the media worker and api. */
export const scriptId = (lang: string, tier: Tier) => `script-${tier}-${lang}`;

export async function runPipeline(state: PipelineState, sink: PipelineSink, only?: Stage[]): Promise<PipelineState> {
  const want = (s: Stage) => !only || only.includes(s);
  const id = state.story.id;

  const step = async (stage: Stage, fn: () => Promise<RunMeta[] | void>) => {
    if (!want(stage)) return;
    sink.emit({ stage, status: "started" });
    try {
      const metas = (await fn()) ?? [];
      for (const m of metas) await sink.recordRun(runOf(id, stage, m));
      await sink.save(state, stage);
      sink.emit({ stage, status: "done" });
    } catch (err) {
      await sink.recordRun(runOf(id, stage, { model: "-", latencyMs: 0 }, false, String(err).slice(0, 500)));
      sink.emit({ stage, status: "failed", detail: String(err).slice(0, 300) });
      throw err;
    }
  };

  await step("claims", async () => {
    const r = await extractClaims(id, state.sources);
    state.claims = r.claims;
    state.claimsDropped = r.dropped;
    return r.metas;
  });
  await step("corroborate", async () => {
    const r = await corroborate(state.claims, state.sources);
    state.claims = r.claims;
    return [r.meta];
  });
  await step("lenses", async () => {
    const r = await analyzeLenses(state.claims, state.sources);
    state.lanes = r.lanes;
    return r.metas;
  });
  await step("research", async () => {
    const r = await research(state.story.title, state.claims, state.sources);
    state.context = r.context;
    state.timeline = r.timeline;
    state.grounded = r.grounded;
    return [r.meta];
  });
  await step("synthesize", async () => {
    const r = await synthesizeAssessment(id, state.claims, state.sources, state.story.version, { lanes: state.lanes, context: state.context });
    state.assessment = r.assessment;
    if (r.assessment.headline && !state.story.summary) state.story.summary = r.assessment.neutralSummary;
    // Wire stories start with the source's headline (often not English); the English desk headline replaces it.
    if (state.story.origin === "wire" && r.assessment.headline) {
      state.story.title = r.assessment.headline;
      state.story.summary = r.assessment.neutralSummary;
    }
    return [r.meta];
  });
  await step("qa", async () => {
    const r = await qaCheck(state.story.title, state.claims, state.sources, state.assessment, { grounded: state.grounded, context: state.context });
    state.qaFlags = r.flags;
    state.story.riskTier = r.riskTier;
    state.story.status = "in_review";
    return r.metas;
  });
  await step("scripts", async () => {
    if (!state.assessment) throw new Error("No assessment to script from");
    const base = await buildScript(state.assessment, state.claims, CHANNEL_PLAN.en.presenter);
    const metas = [base.meta];
    const scripts: OutputRecord[] = [];
    const wanted = state.story.languages.filter(isLang).map((lang) => ({ lang, ...CHANNEL_PLAN[lang] }));
    for (const t of wanted) {
      let payload: ScriptPayload = base.script;
      if (t.lang !== "en") {
        const loc = await localizeScript(base.script, t.lang, t.presenter);
        payload = loc.script;
        metas.push(...loc.metas);
      } else {
        payload = { ...base.script, presenter: t.presenter };
      }
      scripts.push(
        output(state, {
          id: scriptId(t.lang, t.tier), kind: "script", channel: "app", lang: t.lang, tier: t.tier,
          claimIds: [...new Set(payload.lines.flatMap((l) => l.claimIds))], payload,
        }),
      );
    }
    upsertOutputs(state, scripts);
    return metas;
  });
  await step("channels", async () => {
    const metas: RunMeta[] = [];
    const scripts = state.outputs.filter((o) => o.kind === "script");
    const made: OutputRecord[] = [];
    for (const s of scripts) {
      if (!isLang(s.lang)) continue;
      const lang = s.lang;
      const tier = s.tier ?? CHANNEL_PLAN[lang].tier;
      const r = await buildChannelPackage(id, s.payload as unknown as ScriptPayload, lang, tier, state.sources, state.claims);
      metas.push(...r.metas);
      const common = { lang, tier, claimIds: s.claimIds, dependsOn: [s.id] };
      const sfx = `${tier}-${lang}`;
      made.push(
        output(state, { id: `yt-${sfx}`, kind: "yt_meta", channel: "youtube", ...common, payload: { ...r.pkg.yt, videoOutputId: `video-${sfx}-916` } }),
        output(state, { id: `x-${sfx}`, kind: "x_thread", channel: "x", ...common, payload: { ...r.pkg.x, videoOutputId: `video-${sfx}-916` } }),
        output(state, { id: `ig-${sfx}`, kind: "ig_reel", channel: "instagram", ...common, payload: { ...r.pkg.ig, videoOutputId: `video-${sfx}-916` } }),
        output(state, { id: `carousel-${sfx}`, kind: "carousel", channel: "instagram", ...common, payload: r.pkg.carousel }),
        output(state, { id: `fb-${sfx}`, kind: "fb_post", channel: "facebook", ...common, payload: { ...r.pkg.fb, videoOutputId: `video-${sfx}-916` } }),
        output(state, { id: `wa-${sfx}`, kind: "wa_digest", channel: "whatsapp", ...common, payload: r.pkg.wa }),
      );
    }
    upsertOutputs(state, made);
    return metas;
  });
  return state;
}

export function emptyState(story: Story, sources: SourceRecord[]): PipelineState {
  return { story, sources, claims: [], lanes: [], context: [], timeline: [], assessment: null, outputs: [], qaFlags: [], grounded: false, claimsDropped: 0 };
}
