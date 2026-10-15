// The wire: discover → dedupe → cluster → ingest permitted text → create/update stories → run pipeline.
// Runs every INGEST_INTERVAL_MIN locally, or from Cloud Scheduler via POST /v1/internal/ingest.
import {
  Allowlist, allowlistEntryFor, assignLeads, embedTexts, fetchFeed, fetchGdelt, FeedsFile, intakeUrl, STAGES,
  type AllowlistEntry, type Candidate, type FeedConfig, type Lead,
} from "@openlens/agents";
import { CHANNEL_PLAN, isLang, languagesFor, MARKET_CODES, MODELS } from "@openlens/config";
import type { SourceRecord } from "@openlens/schemas";
import { readFile } from "node:fs/promises";
import { emit } from "./bus.js";
import { renderMedia, runStory, type Deps } from "./jobs.js";
import { emptyRecord } from "./store.js";

export interface IngestConfig {
  feeds: FeedConfig[];
  allowlist: AllowlistEntry[];
  markets: string[];
  gdelt: boolean;
  lookbackMin: number;
  /** Ignore leads published longer ago than this (first run would otherwise ingest whole feed backlogs). */
  maxAgeHours: number;
  /** Cap on full-text page fetches per cycle. */
  maxFetchPerCycle: number;
  maxNewStoriesPerCycle: number;
  maxUpdatesPerCycle: number;
  dailyRunBudget: number;
  maxConcurrentRuns: number;
  /** Independent publishers needed before a story is created (a primary document counts on its own). */
  minPublishers: number;
  autoPublish: "off" | "low_risk";
  autoMediaLangs: string[];
}

export interface StoredLead extends Lead {
  firstSeen: string;
  source?: SourceRecord;
  rejected?: string;
}

export interface CycleReport {
  id: string;
  startedAt: string;
  finishedAt?: string;
  discovered: number;
  newLeads: number;
  byMarket: Record<string, number>;
  ingested: number;
  rejected: number;
  embedded: boolean;
  candidatesTouched: number;
  storiesCreated: string[];
  storiesUpdated: string[];
  skippedForBudget: number;
  errors: string[];
}

const env = process.env;
export async function loadIngestConfig(root: string): Promise<IngestConfig> {
  const read = async (p: string, fb: unknown) => JSON.parse(await readFile(`${root}/${p}`, "utf8").catch(() => JSON.stringify(fb)));
  const feeds = FeedsFile.parse(await read("data/sources/feeds.json", { feeds: [] })).feeds;
  const allowlist = Allowlist.parse(await read("data/sources/allowlist.json", { entries: [] })).entries;
  return {
    feeds,
    allowlist,
    markets: (env.INGEST_MARKETS ?? MARKET_CODES.filter((m) => m !== "APAC").join(",")).split(",").map((s) => s.trim()).filter(Boolean),
    gdelt: env.INGEST_GDELT !== "0",
    lookbackMin: Number(env.INGEST_LOOKBACK_MIN ?? 30),
    maxAgeHours: Number(env.INGEST_MAX_AGE_HOURS ?? 48),
    maxFetchPerCycle: Number(env.INGEST_MAX_FETCH ?? 40),
    maxNewStoriesPerCycle: Number(env.INGEST_MAX_NEW ?? 3),
    maxUpdatesPerCycle: Number(env.INGEST_MAX_UPDATES ?? 3),
    dailyRunBudget: Number(env.INGEST_DAILY_RUNS ?? 40),
    maxConcurrentRuns: Number(env.INGEST_CONCURRENCY ?? 2),
    minPublishers: Number(env.INGEST_MIN_PUBLISHERS ?? 2),
    autoPublish: env.AUTO_PUBLISH === "low_risk" ? "low_risk" : "off",
    autoMediaLangs: (env.AUTO_MEDIA_LANGS ?? "en").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** Pluggable effects so the cycle can be tested without network or Gemini. */
export interface IngestEffects {
  discoverFeed(feed: FeedConfig): Promise<Lead[]>;
  discoverGdelt(market: string, minutes: number): Promise<Lead[]>;
  embed(texts: string[]): Promise<number[][]>;
  intake(url: string, storyId: string, sourceId: string, allowlist: AllowlistEntry[], lead?: Lead): ReturnType<typeof intakeUrl>;
  /** Run the agent pipeline (+ policy steps) for a story. */
  process(storyId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- global run limiter ----------
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(max: number, fn: () => Promise<T>): Promise<T> {
  if (active >= max) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Story ids whose pipeline is running in this instance (lost on restart, which is the point). */
const inFlight = new Set<string>();
/** A wire story still drafting/researching this long after its last update was interrupted (e.g. a restart). */
const STUCK_MS = 30 * 60_000;

export function defaultEffects(deps: Deps, cfg: IngestConfig): IngestEffects {
  return {
    discoverFeed: (f) => fetchFeed(f),
    discoverGdelt: (m, min) => fetchGdelt(m, min),
    embed: (t) => embedTexts(t, MODELS.embed),
    intake: (u, s, id, a, l) => intakeUrl(u, s, id, a, fetch, l && { title: l.title, summary: l.summary, publishedAt: l.publishedAt }),
    process: async (id) => {
      if (inFlight.has(id)) return;
      inFlight.add(id);
      try {
        await limited(cfg.maxConcurrentRuns, () => processStory(deps, cfg, id));
      } finally {
        inFlight.delete(id);
      }
    },
    sleep,
  };
}

/** Pipeline + media for configured languages + auto-publish policy. */
export async function processStory(deps: Deps, cfg: IngestConfig, storyId: string) {
  await runStory(deps, storyId, [...STAGES]);
  const rec = await deps.store.get(storyId);
  if (!rec) return;
  const scripts = rec.outputs.filter((o) => o.kind === "script" && cfg.autoMediaLangs.includes(o.lang)).map((o) => o.id);
  if (scripts.length) await renderMedia(deps, storyId, scripts).catch((e) => console.error(`media ${storyId}:`, e));
  await autoPublishIfEligible(deps, cfg, storyId);
}

/**
 * Low-risk policy: a finished wire story with an assessment and no blocking QA flag goes live in
 * OpenLens's own apps, labelled "auto-published · not editor-reviewed". Channel posts still need an editor.
 */
export async function autoPublishIfEligible(deps: Deps, cfg: IngestConfig, storyId: string): Promise<boolean> {
  if (cfg.autoPublish !== "low_risk") return false;
  const fresh = await deps.store.get(storyId);
  if (!fresh || fresh.story.status !== "in_review") return false;
  const blocking = fresh.qaFlags.some((f) => f.severity === "block");
  if (fresh.story.riskTier !== "low" || blocking || !fresh.assessment) return false;
  fresh.story.status = fresh.corrections.length ? "corrected" : "published";
  fresh.story.autoPublished = true;
  // App-only media (video/audio/script) become visible; channel posts still need an editor.
  fresh.outputs = fresh.outputs.map((o) => (o.channel === "app" && o.status === "draft" ? { ...o, status: "approved", approvedBy: "policy:auto-publish" } : o));
  fresh.story.updatedAt = new Date().toISOString();
  await deps.store.put(fresh);
  emit(storyId, { type: "stage", stage: "approve", status: "done", detail: "auto-published (low risk)" });
  return true;
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "story";

let running = false;
export const ingestRunning = () => running;

export async function ingestCycle(deps: Deps, cfg: IngestConfig, fx: IngestEffects, now = new Date()): Promise<CycleReport> {
  if (running) throw Object.assign(new Error("an ingest cycle is already running"), { status: 409 });
  running = true;
  const report: CycleReport = {
    id: `cycle-${now.getTime().toString(36)}`, startedAt: now.toISOString(), discovered: 0, newLeads: 0, byMarket: {},
    ingested: 0, rejected: 0, embedded: false, candidatesTouched: 0, storiesCreated: [], storiesUpdated: [], skippedForBudget: 0, errors: [],
  };
  try {
    const { store } = deps;
    const markets = new Set(cfg.markets);

    // 1) Discover. Feeds: only enabled feeds of verified allowlisted domains.
    const found: Lead[] = [];
    const feeds = cfg.feeds.filter((f) => f.enabled && markets.has(f.market) && cfg.allowlist.some((a) => a.verified && (f.domain === a.domain || f.domain.endsWith(`.${a.domain}`))));
    for (const f of feeds) {
      try {
        found.push(...(await fx.discoverFeed(f)));
      } catch (e) {
        report.errors.push(String(e).slice(0, 200));
      }
    }
    if (cfg.gdelt) {
      for (const m of markets) {
        try {
          found.push(...(await fx.discoverGdelt(m, cfg.lookbackMin)));
        } catch (e) {
          report.errors.push(`gdelt ${m}: ${String(e).slice(0, 120)}`);
        }
        await fx.sleep(5500); // GDELT asks for <= 1 request / 5 s
      }
    }
    report.discovered = found.length;
    const minTime = now.getTime() - cfg.maxAgeHours * 3600_000;
    const recent = found.filter((l) => new Date(l.publishedAt).getTime() >= minTime);

    // 2) Dedupe against leads seen in the last 72 h.
    const leads = await store.getState<Record<string, StoredLead>>("leads", {});
    const cutoff = now.getTime() - 72 * 3600_000;
    for (const [id, l] of Object.entries(leads)) if (new Date(l.firstSeen).getTime() < cutoff) delete leads[id];
    const fresh = [...new Map(recent.filter((l) => !leads[l.id]).map((l) => [l.id, l])).values()];
    report.newLeads = fresh.length;
    for (const l of fresh) {
      leads[l.id] = { ...l, firstSeen: now.toISOString() };
      report.byMarket[l.market] = (report.byMarket[l.market] ?? 0) + 1;
    }

    // 3) Cluster (multilingual embeddings; lexical fallback).
    let vectors: (number[] | null)[] = fresh.map(() => null);
    if (fresh.length) {
      try {
        const out: number[][] = [];
        for (let i = 0; i < fresh.length; i += 100) out.push(...(await fx.embed(fresh.slice(i, i + 100).map((l) => `${l.title}\n${l.summary ?? ""}`))));
        vectors = out;
        report.embedded = true;
      } catch (e) {
        report.errors.push(`embed: ${String(e).slice(0, 160)} (lexical fallback)`);
      }
    }
    const prior = (await store.getState<Candidate[]>("candidates", [])).filter((c) => c.storyId || new Date(c.updatedAt).getTime() > now.getTime() - 7 * 86400_000);
    const { candidates, touched } = assignLeads(fresh, vectors, prior, { now });
    report.candidatesTouched = touched.size;

    // Candidates still owed work from earlier cycles (fetch cap or story budget hit) stay in play,
    // otherwise an event that arrived in a busy cycle would never become a story.
    const owed = (c: Candidate) =>
      c.leadIds.some((id) => {
        const l = leads[id];
        return l && !c.processedLeadIds.includes(id) && (l.source || (!l.rejected && allowlistEntryFor(l.url, cfg.allowlist)));
      });
    const active = candidates.filter((c) => touched.has(c.id) || owed(c));

    // 4) Ingest full text for permitted leads in active candidates (widest-covered events first, capped).
    let fetches = 0;
    for (const c of [...active].sort((a, b) => b.domains.length - a.domains.length)) {
      for (const id of c.leadIds) {
        const l = leads[id];
        if (!l || l.source || l.rejected || !allowlistEntryFor(l.url, cfg.allowlist)) continue;
        if (fetches++ >= cfg.maxFetchPerCycle) break;
        const r = await fx.intake(l.url, c.storyId ?? c.id, `w-${l.id.slice(0, 8)}`, cfg.allowlist, l).catch((e) => ({ rejected: String(e).slice(0, 160) }));
        if ("source" in r && r.source) {
          l.source = r.source;
          report.ingested++;
        } else {
          l.rejected = r.rejected ?? "unknown";
          report.rejected++;
        }
      }
    }

    // 5) Promote / update, most widely covered events first, within budget.
    const budget = await store.getState<{ day: string; runs: number }>("budget", { day: "", runs: 0 });
    const today = now.toISOString().slice(0, 10);
    if (budget.day !== today) Object.assign(budget, { day: today, runs: 0 });
    // Widest-covered first; among equals, the newest event first.
    const ranked = [...active].sort((a, b) => b.domains.length - a.domains.length || b.updatedAt.localeCompare(a.updatedAt));
    const toRun: string[] = [];
    let created = 0, updated = 0;
    for (const c of ranked) {
      const pending = c.leadIds.map((id) => leads[id]).filter((l): l is StoredLead => Boolean(l?.source) && !c.processedLeadIds.includes(l!.id));
      if (!pending.length) continue;
      const allSources = c.leadIds.map((id) => leads[id]?.source).filter((s): s is SourceRecord => Boolean(s));
      const publishers = new Set(allSources.map((s) => s.publisher));
      // A primary document can start a story alone, unless it comes from an alert feed (quakes, weather…).
      const seeds = new Set(cfg.feeds.filter((f) => f.seedsStory).map((f) => f.id));
      const hasPrimary = c.leadIds.some((id) => {
        const l = leads[id];
        return l?.source?.sourceType === "primary" && (!l.feedId || seeds.has(l.feedId));
      });
      if (!c.storyId && publishers.size < cfg.minPublishers && !hasPrimary) continue;
      const isNew = !c.storyId;
      if ((isNew && created >= cfg.maxNewStoriesPerCycle) || (!isNew && updated >= cfg.maxUpdatesPerCycle) || budget.runs >= cfg.dailyRunBudget) {
        report.skippedForBudget++;
        continue;
      }
      const t = now.toISOString();
      if (isNew) {
        const id = `${c.market.toLowerCase()}-${slug(c.title)}-${c.id.slice(-6)}`;
        const rec = emptyRecord({
          id, title: c.title, summary: "", region: c.market, topics: [], languages: languagesFor([c.market]).filter((l) => isLang(l) && CHANNEL_PLAN[l]),
          riskTier: "low", status: "draft", version: 1, createdAt: t, updatedAt: t, origin: "wire",
        });
        rec.sources = allSources.map((s, i) => ({ ...s, id: `s${i + 1}`, storyId: id }));
        await store.put(rec);
        c.storyId = id;
        report.storiesCreated.push(id);
        created++;
      } else {
        const rec = await store.get(c.storyId!);
        if (!rec) continue;
        const known = new Set(rec.sources.map((s) => s.url));
        const add = pending.map((l) => l.source!).filter((s) => !known.has(s.url));
        if (!add.length) continue;
        rec.sources = [...rec.sources, ...add.map((s, i) => ({ ...s, id: `s${rec.sources.length + i + 1}`, storyId: rec.story.id }))];
        rec.story.version += 1;
        if (rec.story.status === "published" || rec.story.status === "corrected") rec.story.status = "stale";
        rec.story.updatedAt = t;
        await store.put(rec);
        report.storiesUpdated.push(rec.story.id);
        updated++;
      }
      c.processedLeadIds.push(...pending.map((l) => l.id));
      budget.runs++;
      toRun.push(c.storyId!);
    }

    await store.putState("leads", leads);
    await store.putState("candidates", candidates);
    // Catch-up: resume wire stories whose pipeline was interrupted (restart), and apply the
    // auto-publish policy to ones that finished while it was off.
    for (const st of await store.listStories()) {
      if (toRun.includes(st.id) || inFlight.has(st.id) || st.origin !== "wire") continue;
      const stuck = (st.status === "draft" || st.status === "researching") && now.getTime() - Date.parse(st.updatedAt) > STUCK_MS;
      if (stuck && budget.runs < cfg.dailyRunBudget) {
        budget.runs++;
        toRun.push(st.id);
      } else if (st.status === "in_review") {
        await autoPublishIfEligible(deps, cfg, st.id);
      }
    }
    await store.putState("budget", budget);
    // 6) Pipelines run in the background (bounded concurrency); the cycle returns now.
    for (const id of toRun) fx.process(id).catch((e) => console.error(`wire pipeline ${id}:`, e));
    return report;
  } finally {
    report.finishedAt = new Date().toISOString();
    const log = await deps.store.getState<CycleReport[]>("cycles", []);
    await deps.store.putState("cycles", [report, ...log].slice(0, 50));
    running = false;
  }
}
