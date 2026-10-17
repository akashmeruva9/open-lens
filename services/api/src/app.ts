import { validateAssessment } from "@openlens/agents";
import { languagesFor, marketOf, MAX_QUOTE_CHARS, PUBLIC_WEB_URL, QUOTE_ONLY_USAGE } from "@openlens/config";
import { SourceRecord, type FeedItem, type OutputRecord, type Story, type StoryBundle } from "@openlens/schemas";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { requireEditor, authMode } from "./auth.js";
import { emit, subscribe } from "./bus.js";
import { applyClaimPatch } from "./corrections.js";
import { evaluate } from "./evals.js";
import { ingestCycle, ingestRunning, type IngestConfig, type IngestEffects } from "./ingest.js";
import { isRunning, regenerate, runStory, type Deps } from "./jobs.js";
import { fallbackDryRun, publisher, type PublishContext } from "./publishing.js";
import { emptyRecord, type StoryRecord } from "./store.js";

const PUBLIC_STATUSES = new Set(["published", "stale", "corrected"]);
const READER_KINDS = new Set(["script", "video", "audio"]);
const READER_OUTPUT_STATUSES = new Set(["approved", "published"]);

/** A market filter matches its own and sub-national stories, plus region-wide (APAC) stories. */
export function inMarket(storyRegion: string, filter: string): boolean {
  if (filter.toUpperCase() === "APAC") return true;
  const m = marketOf(storyRegion);
  return m === "APAC" || storyRegion === filter || m === marketOf(filter);
}

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const userOf = (c: Context) => (c.get("user" as never) as string) ?? "unknown";

/**
 * Videos rendered before the hlsUrl fix stored a local /assets/... playlist next to a GCS mp4;
 * point such playlists at the mp4's sibling so players don't 404.
 */
function fixMediaUrls(r: StoryRecord): StoryRecord {
  let changed = false;
  const outputs = r.outputs.map((o) => {
    const p = o.payload as { mp4Url?: unknown; hlsUrl?: unknown };
    if (o.kind !== "video" || typeof p.hlsUrl !== "string" || typeof p.mp4Url !== "string") return o;
    if (!p.hlsUrl.startsWith("/assets/") || !/^https?:\/\//.test(p.mp4Url)) return o;
    changed = true;
    return { ...o, payload: { ...o.payload, hlsUrl: p.mp4Url.replace(/video-(\d+)\.mp4$/, "hls-$1/index.m3u8") } };
  });
  return changed ? { ...r, outputs } : r;
}

export function toFeedItem(rec: StoryRecord): FeedItem {
  const r = fixMediaUrls(rec);
  const video = r.outputs.find((o) => o.kind === "video" && READER_OUTPUT_STATUSES.has(o.status) && (o.payload as { aspect?: string }).aspect === "9:16");
  const count = (s: string) => r.claims.filter((c) => c.state === s).length;
  return {
    id: r.story.id, title: r.assessment?.headline || r.story.title, summary: r.story.summary || r.assessment?.neutralSummary || "",
    region: r.story.region, topics: r.story.topics, languages: r.story.languages, status: r.story.status, updatedAt: r.story.updatedAt,
    sourceCount: r.sources.length, lensesCovered: r.lanes.map((l) => l.lens),
    evidence: { supported: count("supported"), contested: count("contested"), unverified: count("unverified") },
    heroImage: (video?.payload as { thumbnailUrl?: string } | undefined)?.thumbnailUrl ?? r.story.heroImage,
    videoUrl: (video?.payload as { mp4Url?: string } | undefined)?.mp4Url,
    corrected: r.corrections.length > 0,
    autoPublished: r.story.autoPublished,
    checksFlagged: r.story.checksFlagged,
    videos: r.outputs
      .filter((o) => o.kind === "video" && READER_OUTPUT_STATUSES.has(o.status))
      .map((o) => {
        const p = o.payload as { aspect?: "9:16" | "16:9"; durationSeconds?: number; thumbnailUrl?: string; mp4Url?: string; hlsUrl?: string };
        return { lang: o.lang, aspect: p.aspect, durationSeconds: p.durationSeconds, thumbnailUrl: p.thumbnailUrl, mp4Url: p.mp4Url, hlsUrl: p.hlsUrl, aiPresenter: o.aiDisclosure };
      })
      .sort((a, b) => (a.aspect === "9:16" ? 0 : 1) - (b.aspect === "9:16" ? 0 : 1)),
    lastCorrection: r.corrections.length ? { at: r.corrections.at(-1)!.at, reason: r.corrections.at(-1)!.reason } : undefined,
  };
}

const clip = (s: string) => (s.length > MAX_QUOTE_CHARS ? `${s.slice(0, MAX_QUOTE_CHARS - 1).trimEnd()}…` : s);

/**
 * Quote-only outlets: readers get the cited passages (clipped), never the stored article text.
 * The source's `text` becomes just those excerpts so the passage UI can still highlight them.
 */
export function quoteOnlyView(r: StoryRecord): Pick<StoryBundle, "sources" | "claims"> {
  const quoteOnly = new Set(r.sources.filter((s) => s.rights.usage === QUOTE_ONLY_USAGE).map((s) => s.id));
  if (!quoteOnly.size) return { sources: r.sources, claims: r.claims };
  const claims = r.claims.map((c) => ({
    ...c,
    evidence: c.evidence.map((e) => (quoteOnly.has(e.sourceId) ? { ...e, passage: clip(e.passage) } : e)),
  }));
  const sources = r.sources.map((s) => {
    if (!quoteOnly.has(s.id)) return s;
    const quotes = [...new Set(claims.flatMap((c) => c.evidence.filter((e) => e.sourceId === s.id).map((e) => e.passage)))];
    return { ...s, text: quotes.join("\n\n…\n\n") };
  });
  return { sources, claims };
}

/** Reader view: only approved media, no ops data, no stored text of quote-only outlets. */
export function toReaderBundle(rec: StoryRecord): StoryBundle {
  const r = fixMediaUrls(rec);
  const { qaFlags: _q, runs: _r, grounded: _g, claimsDropped: _d, ...bundle } = r;
  return {
    ...bundle,
    ...quoteOnlyView(r),
    outputs: r.outputs.filter((o) => READER_KINDS.has(o.kind) && READER_OUTPUT_STATUSES.has(o.status)),
    publications: r.publications.filter((p) => p.mode === "live"),
  };
}

const CreateStory = z.object({
  title: z.string().min(3),
  region: z.string(),
  topics: z.array(z.string()),
  /** Defaults to the market's languages + English (see languagesFor). */
  languages: z.array(z.string()).optional(),
  riskTier: z.enum(["low", "sensitive"]).default("low"),
  sources: z.array(SourceRecord.omit({ storyId: true })).min(1),
});

export interface WireOptions {
  config: IngestConfig;
  effects: IngestEffects;
  /** Shared secret Cloud Scheduler sends as x-ingest-token. Unset = only allowed in dev auth mode. */
  token?: string;
}

export function createApp(deps: Deps, wire?: WireOptions) {
  const app = new Hono();
  const corsOrigins = (process.env.CORS_ORIGINS ?? "*").split(",");
  app.use("*", cors({ origin: corsOrigins.includes("*") ? "*" : corsOrigins, allowHeaders: ["authorization", "content-type", "x-dev-user"] }));
  app.onError((err, c) => {
    if (err instanceof z.ZodError) return c.json({ error: "invalid request", issues: err.issues }, 400);
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 500) console.error(err);
    return c.json({ error: err.message }, status as 400);
  });

  const load = async (id: string) => {
    const r = await deps.store.get(id);
    if (!r) throw httpError(404, `story ${id} not found`);
    return r;
  };
  const findOutput = async (outputId: string) => {
    for (const s of await deps.store.listStories()) {
      const r = await deps.store.get(s.id);
      const o = r?.outputs.find((x) => x.id === outputId);
      if (r && o) return { rec: r, output: o };
    }
    throw httpError(404, `output ${outputId} not found`);
  };

  app.get("/health", (c) => c.json({ ok: true, authMode }));

  // ---------- Reader ----------
  // The public feed reads every published story with its sub-collections (seconds on Firestore),
  // so it is served from memory and rebuilt in the background at most every FEED_TTL_MS
  // (single Cloud Run instance; a stale copy is fine for a news feed).
  const FEED_TTL_MS = 30_000;
  let feedCache: { at: number; items: FeedItem[] } | undefined;
  let feedBuilding: Promise<FeedItem[]> | undefined;
  const buildFeed = () =>
    (feedBuilding ??= (async () => {
      try {
        const recs = await Promise.all((await deps.store.listStories()).filter((s) => PUBLIC_STATUSES.has(s.status)).map((s) => deps.store.get(s.id)));
        const items = recs.filter((r): r is StoryRecord => Boolean(r)).map(toFeedItem).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        feedCache = { at: Date.now(), items };
        return items;
      } finally {
        feedBuilding = undefined;
      }
    })());
  const publicFeed = async () => {
    if (!feedCache) return buildFeed();
    if (Date.now() - feedCache.at > FEED_TTL_MS) void buildFeed().catch((e) => console.error("feed rebuild failed:", e));
    return feedCache.items;
  };
  app.get("/v1/feed", async (c) => {
    const { lang, region, topic } = c.req.query();
    const items = (await publicFeed()).filter(
      (f) => (!lang || f.languages.includes(lang)) && (!region || inMarket(f.region, region)) && (!topic || f.topics.includes(topic)),
    );
    c.header("cache-control", "public, max-age=15");
    return c.json(items);
  });
  // Story pages: same idea, per story, shorter TTL.
  const storyCache = new Map<string, { at: number; bundle: StoryBundle }>();
  app.get("/v1/stories/:id", async (c) => {
    const id = c.req.param("id");
    const hit = storyCache.get(id);
    if (hit && Date.now() - hit.at < 15_000) return c.json(hit.bundle);
    const r = await load(id);
    if (!PUBLIC_STATUSES.has(r.story.status)) throw httpError(404, "not published");
    const bundle = toReaderBundle(r);
    if (storyCache.size > 500) storyCache.clear();
    storyCache.set(id, { at: Date.now(), bundle });
    return c.json(bundle);
  });
  app.get("/v1/stories/:id/events", (c) =>
    streamSSE(c, async (stream) => {
      const id = c.req.param("id");
      const queue: string[] = [];
      let wake: (() => void) | undefined;
      const off = subscribe(id, (m) => { queue.push(JSON.stringify(m)); wake?.(); });
      stream.onAbort(off);
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ running: isRunning(id) }) });
      while (!stream.aborted) {
        while (queue.length) await stream.writeSSE({ event: "message", data: queue.shift()! });
        await Promise.race([new Promise<void>((r) => (wake = r)), stream.sleep(15000)]);
        if (!queue.length) await stream.writeSSE({ event: "ping", data: "{}" });
      }
      off();
    }),
  );
  app.post("/v1/subscribers", async (c) => {
    const b = z.object({ phone: z.string().regex(/^\+?[0-9]{8,15}$/), lang: z.string(), region: z.string(), topics: z.array(z.string()), consent: z.literal(true) }).parse(await c.req.json());
    const id = createHash("sha256").update(b.phone).digest("hex").slice(0, 16);
    await deps.store.addSubscriber({ id, phone: b.phone, lang: b.lang, region: b.region, topics: b.topics, consentAt: new Date().toISOString() });
    return c.json({ id }, 201);
  });
  // Opt-out is always available and needs no auth beyond knowing the number/token.
  app.delete("/v1/subscribers", async (c) => {
    const { phone } = z.object({ phone: z.string() }).parse(await c.req.json());
    await deps.store.removeSubscriber(phone);
    return c.body(null, 204);
  });
  app.delete("/v1/devices", async (c) => {
    const { token } = z.object({ token: z.string() }).parse(await c.req.json());
    await deps.store.removeDevice(token);
    return c.body(null, 204);
  });
  app.post("/v1/devices", async (c) => {
    const b = z.object({ token: z.string().min(10), platform: z.enum(["ios", "android", "web"]), lang: z.string(), region: z.string().optional(), topics: z.array(z.string()).optional() }).parse(await c.req.json());
    const id = createHash("sha256").update(b.token).digest("hex").slice(0, 16);
    await deps.store.addDevice({ id, ...b, at: new Date().toISOString() });
    return c.json({ id }, 201);
  });

  // ---------- Studio ----------
  const studio = new Hono();
  studio.use("*", requireEditor);

  studio.get("/stories", async (c) => c.json((await deps.store.listStories()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
  studio.get("/stories/:id", async (c) => {
    const { qaFlags: _q, runs: _r, grounded: _g, claimsDropped: _d, ...bundle } = await load(c.req.param("id"));
    return c.json(bundle);
  });
  studio.post("/stories", async (c) => {
    const b = CreateStory.parse(await c.req.json());
    const id = b.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) + "-" + Date.now().toString(36).slice(-4);
    const t = new Date().toISOString();
    const story: Story = { id, title: b.title, summary: "", region: b.region, topics: b.topics, languages: b.languages ?? languagesFor([b.region]), riskTier: b.riskTier, status: "draft", version: 1, createdAt: t, updatedAt: t };
    const rec = emptyRecord(story);
    rec.sources = b.sources.map((s) => ({ ...s, storyId: id, contentHash: createHash("sha256").update(s.text).digest("hex") }));
    await deps.store.put(rec);
    return c.json(story, 201);
  });
  studio.post("/stories/:id/run", async (c) => {
    const id = c.req.param("id");
    await load(id);
    const body = (await c.req.json().catch(() => ({}))) as { stages?: string[] };
    runStory(deps, id, body.stages as never).catch((e) => console.error(`pipeline ${id} failed:`, e));
    return c.json({ accepted: true }, 202);
  });
  studio.post("/stories/:id/approve", async (c) => {
    const r = await load(c.req.param("id"));
    const blocking = r.qaFlags.filter((f) => f.severity === "block");
    if (blocking.length) return c.json({ error: "blocking QA flags", flags: blocking }, 409);
    if (!r.assessment) throw httpError(409, "no assessment yet");
    r.story.status = r.corrections.length ? "corrected" : "published";
    r.story.updatedAt = new Date().toISOString();
    await deps.store.put(r);
    emit(r.story.id, { type: "stage", stage: "approve", status: "done" });
    const pub = await publisher();
    await pub?.sendPush({ topic: `region-${r.story.region}`, title: r.assessment.headline, body: r.story.summary.slice(0, 140), data: { storyId: r.story.id } }).catch(() => undefined);
    return c.json(r.story);
  });
  studio.patch("/stories/:id/claims/:claimId", async (c) => {
    const r = await load(c.req.param("id"));
    const b = z.object({ text: z.string().optional(), state: z.enum(["supported", "contested", "attributed", "unverified", "superseded"]).optional(), reason: z.string().min(3) }).parse(await c.req.json());
    const res = applyClaimPatch(r, c.req.param("claimId"), b, userOf(c));
    // Re-run deterministic assessment checks against the corrected ledger.
    const ASSESSMENT_KINDS = new Set(["unknown_claim_id", "uncited_section", "unsupported_established"]);
    res.rec.qaFlags = [
      ...res.rec.qaFlags.filter((f) => !ASSESSMENT_KINDS.has(f.kind)),
      ...(res.rec.assessment
        ? validateAssessment(res.rec.assessment, res.rec.claims).map((v) => ({
            severity: v.kind === "unsupported_established" ? ("block" as const) : ("warn" as const),
            kind: v.kind, detail: v.detail, target: "assessment",
          }))
        : []),
    ];
    await deps.store.put(res.rec);
    emit(r.story.id, { type: "correction", correctionId: res.event.id });
    for (const oid of res.event.impactedOutputIds) emit(r.story.id, { type: "output", outputId: oid, status: "needs_review" });
    return c.json({ claim: res.claim, correction: res.event });
  });
  studio.post("/outputs/:outputId/approve", async (c) => {
    const { rec, output } = await findOutput(c.req.param("outputId"));
    if (!["draft", "qa", "needs_review", "failed"].includes(output.status)) throw httpError(409, `cannot approve from ${output.status}`);
    const next: OutputRecord = { ...output, status: "approved", approvedBy: userOf(c), staleReason: undefined, ledgerVersion: rec.story.version, updatedAt: new Date().toISOString() };
    rec.outputs = rec.outputs.map((o) => (o.id === output.id ? next : o));
    await deps.store.put(rec);
    emit(rec.story.id, { type: "output", outputId: output.id, status: "approved" });
    return c.json(next);
  });
  studio.post("/outputs/:outputId/regenerate", async (c) => {
    const { rec } = await findOutput(c.req.param("outputId"));
    regenerate(deps, rec.story.id, c.req.param("outputId")).catch((e) => console.error("regenerate failed:", e));
    return c.json({ accepted: true }, 202);
  });
  studio.post("/outputs/:outputId/publish", async (c) => {
    const { rec, output } = await findOutput(c.req.param("outputId"));
    const { mode } = z.object({ mode: z.enum(["live", "dry_run"]).default("dry_run") }).parse(await c.req.json().catch(() => ({})));
    if (output.status !== "approved" && output.status !== "published") throw httpError(409, "output must be approved before publishing");
    if (!PUBLIC_STATUSES.has(rec.story.status) && output.channel !== "app") throw httpError(409, "approve the story before publishing to channels");
    const by = userOf(c);
    const ctx: PublishContext = {
      approvedBy: by,
      storyUrl: `${PUBLIC_WEB_URL}/story/${rec.story.id}`,
      getOutput: async (id) => rec.outputs.find((o) => o.id === id),
      resolveAsset: async (p, { public: isPublic }) => {
        if (isPublic) {
          if (/^https:/.test(p)) return p;
          throw httpError(409, "channel needs a public media URL; configure ASSETS_BUCKET");
        }
        const local = deps.assets.localPath(p);
        return local && existsSync(local) ? local : p; // cache miss (another instance rendered it): publisher downloads the URL
      },
    };
    const pubMod = await publisher();
    let publication;
    if (pubMod) {
      // Reach hashtags for this channel (our videos are all vertical).
      const post = pubMod.withHashtags?.(output, { topics: rec.story.topics, region: rec.story.region, siblings: rec.outputs }, { vertical: true }) ?? output;
      const p = pubMod.getPublisher(output.channel);
      const v = await p.validate(post, ctx);
      if (!v.ok) return c.json({ error: "validation failed", ...v }, 422);
      const recipients = output.channel === "whatsapp"
        ? (await deps.store.listSubscribers()).filter((s) => s.lang === output.lang).map((s) => s.phone)
        : undefined;
      publication = await p.publish(post, ctx, { mode, recipients });
    } else {
      if (mode === "live") throw httpError(503, "publisher package not installed");
      publication = fallbackDryRun(output, by);
    }
    const fresh = await load(rec.story.id);
    fresh.publications = [...fresh.publications, publication];
    if (publication.status === "published")
      fresh.outputs = fresh.outputs.map((o) => (o.id === output.id ? { ...o, status: "published", updatedAt: new Date().toISOString() } : o));
    await deps.store.put(fresh);
    emit(rec.story.id, { type: "publication", publicationId: publication.id, status: publication.status });
    return c.json(publication);
  });
  studio.get("/stories/:id/evals", async (c) => c.json(evaluate(await load(c.req.param("id")))));
  studio.get("/stories/:id/runs", async (c) => c.json((await load(c.req.param("id"))).runs));
  studio.get("/channels", async (c) => {
    const pub = await publisher();
    if (pub) return c.json(pub.channelStatuses());
    return c.json(["app", "youtube", "x", "instagram", "facebook", "whatsapp"].map((ch) => ({ channel: ch, live: ch === "app", reason: ch === "app" ? undefined : "publisher not installed" })));
  });

  // ---------- Wire (automatic discovery) ----------
  app.post("/v1/internal/ingest", async (c) => {
    if (!wire) throw httpError(503, "wire not configured");
    const ok = wire.token ? c.req.header("x-ingest-token") === wire.token : authMode === "dev";
    if (!ok) return c.json({ error: "forbidden" }, 403);
    if (ingestRunning()) return c.json({ error: "cycle already running" }, 409);
    ingestCycle(deps, wire.config, wire.effects)
      .then((r) => console.log(`[wire] ${r.id}: ${r.discovered} discovered, ${r.newLeads} new leads, ${r.ingested} ingested, +${r.storiesCreated.length} stories, ~${r.storiesUpdated.length} updated${r.errors.length ? `, errors: ${r.errors.join(" | ").slice(0, 400)}` : ""}`))
      .catch((e) => console.error("ingest cycle failed:", e));
    return c.json({ accepted: true }, 202);
  });
  studio.get("/ingest", async (c) => {
    const cfg = wire?.config;
    const candidates = await deps.store.getState<{ id: string; market: string; title: string; domains: string[]; leadIds: string[]; storyId?: string; updatedAt: string }[]>("candidates", []);
    return c.json({
      configured: Boolean(wire),
      running: ingestRunning(),
      policy: cfg && {
        markets: cfg.markets, gdelt: cfg.gdelt, autoPublish: cfg.autoPublish, autoMediaLangs: cfg.autoMediaLangs,
        minPublishers: cfg.minPublishers, dailyRunBudget: cfg.dailyRunBudget,
        feedsEnabled: cfg.feeds.filter((f) => f.enabled).length, verifiedOutlets: cfg.allowlist.filter((a) => a.verified).length,
      },
      budget: await deps.store.getState("budget", { day: "", runs: 0 }),
      cycles: await deps.store.getState("cycles", []),
      candidates: candidates
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 50)
        .map(({ id, market, title, domains, leadIds, storyId, updatedAt }) => ({ id, market, title, domains, leads: leadIds.length, storyId, updatedAt })),
    });
  });
  studio.post("/ingest/run", async (c) => {
    if (!wire) throw httpError(503, "wire not configured");
    if (ingestRunning()) return c.json({ error: "cycle already running" }, 409);
    ingestCycle(deps, wire.config, wire.effects).catch((e) => console.error("ingest cycle failed:", e));
    return c.json({ accepted: true }, 202);
  });

  app.route("/v1/studio", studio);
  return app;
}
