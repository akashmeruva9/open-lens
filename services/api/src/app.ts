import { PUBLIC_WEB_URL } from "@openlens/config";
import { SourceRecord, type FeedItem, type OutputRecord, type Story, type StoryBundle } from "@openlens/schemas";
import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { requireEditor, authMode } from "./auth.js";
import { emit, subscribe } from "./bus.js";
import { applyClaimPatch } from "./corrections.js";
import { evaluate } from "./evals.js";
import { isRunning, regenerate, runStory, type Deps } from "./jobs.js";
import { fallbackDryRun, publisher, type PublishContext } from "./publishing.js";
import { emptyRecord, type StoryRecord } from "./store.js";

const PUBLIC_STATUSES = new Set(["published", "stale", "corrected"]);
const READER_KINDS = new Set(["script", "video", "audio"]);
const READER_OUTPUT_STATUSES = new Set(["approved", "published"]);

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const userOf = (c: Context) => (c.get("user" as never) as string) ?? "unknown";

export function toFeedItem(r: StoryRecord): FeedItem {
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
  };
}

/** Reader view: only approved media, no ops data. */
export function toReaderBundle(r: StoryRecord): StoryBundle {
  const { qaFlags: _q, runs: _r, grounded: _g, claimsDropped: _d, ...bundle } = r;
  return {
    ...bundle,
    outputs: r.outputs.filter((o) => READER_KINDS.has(o.kind) && READER_OUTPUT_STATUSES.has(o.status)),
    publications: r.publications.filter((p) => p.mode === "live"),
  };
}

const CreateStory = z.object({
  title: z.string().min(3),
  region: z.string(),
  topics: z.array(z.string()),
  languages: z.array(z.string()).default(["en", "hi", "te", "es"]),
  riskTier: z.enum(["low", "sensitive"]).default("low"),
  sources: z.array(SourceRecord.omit({ storyId: true })).min(1),
});

export function createApp(deps: Deps) {
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
  app.get("/v1/feed", async (c) => {
    const { lang, region, topic } = c.req.query();
    const recs = await Promise.all((await deps.store.listStories()).filter((s) => PUBLIC_STATUSES.has(s.status)).map((s) => deps.store.get(s.id)));
    const items = recs
      .filter((r): r is StoryRecord => Boolean(r))
      .filter((r) => (!lang || r.story.languages.includes(lang)) && (!region || r.story.region === region) && (!topic || r.story.topics.includes(topic)))
      .map(toFeedItem)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return c.json(items);
  });
  app.get("/v1/stories/:id", async (c) => {
    const r = await load(c.req.param("id"));
    if (!PUBLIC_STATUSES.has(r.story.status)) throw httpError(404, "not published");
    return c.json(toReaderBundle(r));
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
    const story: Story = { id, title: b.title, summary: "", region: b.region, topics: b.topics, languages: b.languages, riskTier: b.riskTier, status: "draft", version: 1, createdAt: t, updatedAt: t };
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
        return deps.assets.localPath(p) ?? p;
      },
    };
    const pubMod = await publisher();
    let publication;
    if (pubMod) {
      const p = pubMod.getPublisher(output.channel);
      const v = await p.validate(output, ctx);
      if (!v.ok) return c.json({ error: "validation failed", ...v }, 422);
      const recipients = output.channel === "whatsapp"
        ? (await deps.store.listSubscribers()).filter((s) => s.lang === output.lang).map((s) => s.phone)
        : undefined;
      publication = await p.publish(output, ctx, { mode, recipients });
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

  app.route("/v1/studio", studio);
  return app;
}
