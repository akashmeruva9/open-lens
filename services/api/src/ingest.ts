// The wire: discover → dedupe → cluster → ingest permitted text → create/update stories → run pipeline.
// Runs every INGEST_INTERVAL_MIN locally, or from Cloud Scheduler via POST /v1/internal/ingest.
import {
  Allowlist, allowlistEntryFor, assignLeads, classifyTopics, embedTexts, fetchFeed, fetchGdelt, FeedsFile, intakeUrl, STAGES,
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
  /** off: editors approve; low_risk: low-risk clean stories go live; all: every finished story goes live. */
  autoPublish: "off" | "low_risk" | "all";
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
    markets: (env.INGEST_MARKETS ?? MARKET_CODES.join(",")).split(",").map((s) => s.trim()).filter(Boolean),
    gdelt: env.INGEST_GDELT !== "0",
    lookbackMin: Number(env.INGEST_LOOKBACK_MIN ?? 30),
    maxAgeHours: Number(env.INGEST_MAX_AGE_HOURS ?? 48),
    maxFetchPerCycle: Number(env.INGEST_MAX_FETCH ?? 40),
    maxNewStoriesPerCycle: Number(env.INGEST_MAX_NEW ?? 3),
    maxUpdatesPerCycle: Number(env.INGEST_MAX_UPDATES ?? 3),
    dailyRunBudget: Number(env.INGEST_DAILY_RUNS ?? 40),
    maxConcurrentRuns: Number(env.INGEST_CONCURRENCY ?? 2),
    minPublishers: Number(env.INGEST_MIN_PUBLISHERS ?? 2),
    autoPublish: env.AUTO_PUBLISH === "all" ? "all" : env.AUTO_PUBLISH === "low_risk" ? "low_risk" : "off",
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
  /** Topics for a story that has none (backfill); optional so tests can omit it. */
  classify?(title: string, summary: string): Promise<string[]>;
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
    classify: (t, s) => classifyTopics(t, s),
  };
}

/** Pipeline + media for configured languages + auto-publish policy. */
export async function processStory(deps: Deps, cfg: IngestConfig, storyId: string) {
  // Stories created before the per-story cap may hold dozens of sources: trim before the run
  // (the pipeline re-extracts claims from scratch, so source ids can be renumbered).
  const before = await deps.store.get(storyId);
  if (before?.story.origin === "wire" && before.sources.length > MAX_SOURCES_PER_STORY) {
    before.sources = pickSources(before.sources).map((s, i) => ({ ...s, id: `s${i + 1}` }));
    before.claims = [];
    await deps.store.put(before);
  }
  await runStory(deps, storyId, [...STAGES]);
  const rec = await deps.store.get(storyId);
  if (!rec) return;
  const scripts = rec.outputs.filter((o) => o.kind === "script" && cfg.autoMediaLangs.includes(o.lang)).map((o) => o.id);
  if (scripts.length) await renderMedia(deps, storyId, scripts).catch((e) => console.error(`media ${storyId}:`, e));
  await autoPublishIfEligible(deps, cfg, storyId);
}

/**
 * Auto-publish policy for OpenLens's own apps (channel posts are never auto-published):
 * - low_risk: a finished story with an assessment, low risk and no blocking QA flag goes live;
 * - all: every finished story goes live; a blocking QA flag is shown to readers (checksFlagged).
 * Both are labelled "auto-published · not editor-reviewed".
 */
export async function autoPublishIfEligible(deps: Deps, cfg: IngestConfig, storyId: string): Promise<boolean> {
  if (cfg.autoPublish === "off") return false;
  const fresh = await deps.store.get(storyId);
  if (!fresh || fresh.story.status !== "in_review") return false;
  const blocking = fresh.qaFlags.some((f) => f.severity === "block");
  if (cfg.autoPublish === "low_risk" && (fresh.story.riskTier !== "low" || blocking || !fresh.assessment)) return false;
  fresh.story.status = fresh.corrections.length ? "corrected" : "published";
  fresh.story.autoPublished = true;
  fresh.story.checksFlagged = blocking || undefined;
  // App-only media (video/audio/script) become visible; channel posts still need an editor.
  fresh.outputs = fresh.outputs.map((o) => (o.channel === "app" && o.status === "draft" ? { ...o, status: "approved", approvedBy: "policy:auto-publish" } : o));
  fresh.story.updatedAt = new Date().toISOString();
  await deps.store.put(fresh);
  emit(storyId, { type: "stage", stage: "approve", status: "done", detail: "auto-published (low risk)" });
  return true;
}

/** Most sources one story reads: more mostly repeats the same facts and slows every stage. */
export const MAX_SOURCES_PER_STORY = 8;

/**
 * Pick sources for a story: one article per outlet, primary documents first, then round-robin
 * across lean lanes (left / center / right / unrated) so no side dominates, newest first in each.
 */
export function pickSources(candidates: SourceRecord[], max = MAX_SOURCES_PER_STORY, have: SourceRecord[] = []): SourceRecord[] {
  const seen = new Set(have.map((s) => s.publisher));
  const byPublisher = new Map<string, SourceRecord>();
  for (const s of [...candidates].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    if (!seen.has(s.publisher) && !byPublisher.has(s.publisher)) byPublisher.set(s.publisher, s);
  }
  const pool = [...byPublisher.values()];
  const out: SourceRecord[] = pool.filter((s) => s.sourceType === "primary");
  const lanes = (["left", "center", "right", "unrated"] as const).map((l) => pool.filter((s) => s.sourceType !== "primary" && s.lens.rating === l));
  for (let i = 0; lanes.some((l) => i < l.length); i++) for (const l of lanes) if (l[i]) out.push(l[i]!);
  return out.slice(0, Math.max(0, max - have.length));
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
    // A few feeds at a time: ~100 outlet feeds sequentially would take minutes.
    const queue = [...feeds];
    await Promise.all(
      Array.from({ length: Math.min(8, queue.length) }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          try {
            found.push(...(await fx.discoverFeed(f)));
          } catch (e) {
            report.errors.push(String(e).slice(0, 200));
          }
        }
      }),
    );
    if (cfg.gdelt) {
      // GDELT is per country; the region-wide and world desks have none.
      for (const m of [...markets].filter((x) => x !== "APAC" && x !== "WORLD")) {
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

    // Only events that could become stories are worth fetching: an existing story, coverage by
    // enough independent outlets, or a primary document that may start a story on its own
    // (same rule as promotion below; alert feeds never seed).
    const seedFeeds = new Set(cfg.feeds.filter((f) => f.seedsStory).map((f) => f.id));
    const canSeed = (l: StoredLead | undefined) =>
      Boolean(l) && allowlistEntryFor(l!.url, cfg.allowlist)?.sourceType === "primary" && (!l!.feedId || seedFeeds.has(l!.feedId));
    const promising = (c: Candidate) =>
      Boolean(c.storyId) || new Set(c.domains).size >= cfg.minPublishers || c.leadIds.some((id) => canSeed(leads[id]));
    // Candidates still owed work from earlier cycles (fetch cap or story budget hit) stay in play,
    // otherwise an event that arrived in a busy cycle would never become a story.
    const owed = (c: Candidate) =>
      promising(c) &&
      c.leadIds.some((id) => {
        const l = leads[id];
        return l && !c.processedLeadIds.includes(id) && (l.source || (!l.rejected && allowlistEntryFor(l.url, cfg.allowlist)));
      });
    const active = candidates.filter((c) => (touched.has(c.id) && promising(c)) || owed(c));

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
    // `ids`: stories charged today. A story re-queued after a restart is not charged twice.
    const budget = await store.getState<{ day: string; runs: number; ids?: string[] }>("budget", { day: "", runs: 0 });
    const today = now.toISOString().slice(0, 10);
    if (budget.day !== today) Object.assign(budget, { day: today, runs: 0, ids: [] });
    const charged = new Set(budget.ids ?? []);
    const charge = (id: string) => {
      if (charged.has(id)) return;
      charged.add(id);
      budget.runs++;
    };
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
        rec.sources = pickSources(allSources).map((s, i) => ({ ...s, id: `s${i + 1}`, storyId: id }));
        await store.put(rec);
        c.storyId = id;
        report.storiesCreated.push(id);
        created++;
      } else {
        const rec = await store.get(c.storyId!);
        if (!rec) continue;
        const known = new Set(rec.sources.map((s) => s.url));
        const add = pickSources(pending.map((l) => l.source!).filter((s) => !known.has(s.url)), MAX_SOURCES_PER_STORY, rec.sources);
        if (!add.length) {
          // Nothing new worth adding (same outlets, or the story already has enough sources).
          c.processedLeadIds.push(...pending.map((l) => l.id));
          for (const l of pending) l.source = { ...l.source!, text: "" };
          continue;
        }
        rec.sources = [...rec.sources, ...add.map((s, i) => ({ ...s, id: `s${rec.sources.length + i + 1}`, storyId: rec.story.id }))];
        rec.story.version += 1;
        if (rec.story.status === "published" || rec.story.status === "corrected") rec.story.status = "stale";
        rec.story.updatedAt = t;
        await store.put(rec);
        report.storiesUpdated.push(rec.story.id);
        updated++;
      }
      c.processedLeadIds.push(...pending.map((l) => l.id));
      // The story now holds these sources; keep only metadata in wire state (Firestore doc size).
      for (const l of pending) l.source = { ...l.source!, text: "" };
      charge(c.storyId!);
      toRun.push(c.storyId!);
    }

    await store.putState("leads", leads);
    await store.putState("candidates", candidates);
    // Catch-up: resume wire stories whose pipeline was interrupted (restart), and apply the
    // auto-publish policy to ones that finished while it was off.
    for (const st of await store.listStories()) {
      if (toRun.includes(st.id) || inFlight.has(st.id)) continue;
      // Stuck mid-run (restart), or stale (sources changed / format upgraded) and not yet re-run.
      const stuck = st.origin === "wire" && (st.status === "draft" || st.status === "researching" || st.status === "stale") && now.getTime() - Date.parse(st.updatedAt) > STUCK_MS;
      if (stuck && (charged.has(st.id) || budget.runs < cfg.dailyRunBudget)) {
        charge(st.id);
        toRun.push(st.id);
      } else if (st.status === "in_review" && (cfg.autoPublish === "all" || st.origin === "wire")) {
        await autoPublishIfEligible(deps, cfg, st.id);
      }
    }
    budget.ids = [...charged];
    await store.putState("budget", budget);
    // Backfill topics for live stories written before topics were assigned (cheap, bounded per cycle).
    if (fx.classify) {
      let n = 0;
      for (const st of await store.listStories()) {
        if (n >= 40 || st.topics.length || !["published", "corrected", "stale"].includes(st.status) || toRun.includes(st.id)) continue;
        const rec = await store.get(st.id);
        if (!rec) continue;
        n++;
        try {
          rec.story.topics = await fx.classify(rec.assessment?.headline || rec.story.title, rec.assessment?.neutralSummary || rec.story.summary);
          await store.put(rec);
        } catch (e) {
          report.errors.push(`topics ${st.id}: ${String(e).slice(0, 120)}`);
        }
      }
    }
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
