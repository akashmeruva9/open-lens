import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { createApp } from "./app.js";
import { defaultEffects, ingestCycle, ingestRunning, loadIngestConfig, resumeInterrupted } from "./ingest.js";
import { FileStore, FirestoreStore, type Store } from "./store.js";

// A stray rejected promise (e.g. a timed-out Gemini fetch nobody awaited) must not kill the process:
// that would drop every queued pipeline. Log it; the pipeline that owned it fails and is resumed later.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason instanceof Error ? (reason.stack ?? reason.message) : reason);
});

// Social credentials (YouTube / Meta tokens) arrive as one secret mounted as a KEY=VALUE file on Cloud Run; load it before anything posts.
if (process.env.SOCIAL_ENV_FILE && existsSync(process.env.SOCIAL_ENV_FILE)) {
  for (const line of readFileSync(process.env.SOCIAL_ENV_FILE, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

const DATA_DIR = resolve(process.env.DATA_DIR ?? "../../.data");
const WORK_DIR = resolve(process.env.WORK_DIR ?? `${DATA_DIR}/work`);

async function makeStore(): Promise<Store> {
  if (process.env.STORE === "firestore") {
    const { initializeApp, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
    const db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    return new FirestoreStore(db);
  }
  return new FileStore(DATA_DIR);
}

function makeAssets(): AssetStore {
  return process.env.ASSETS_BUCKET ? new GcsAssets(process.env.ASSETS_BUCKET, `${WORK_DIR}/asset-cache`) : new LocalAssets(`${DATA_DIR}/assets`);
}

if (process.env.AUTH_MODE === "firebase" || process.env.K_SERVICE) {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
}

const deps = { store: await makeStore(), assets: makeAssets(), workDir: WORK_DIR };
const ingestConfig = await loadIngestConfig(resolve(process.env.SOURCES_ROOT ?? "../.."));
const wire = { config: ingestConfig, effects: defaultEffects(deps, ingestConfig), token: process.env.INGEST_TOKEN };
const app = createApp(deps, wire);
// Stories the last instance was still writing when it stopped (a deploy, a restart) are finished now, a few minutes after boot.
setTimeout(() => void resumeInterrupted(deps, ingestConfig).then((ids) => ids.length && console.log(`[wire] resumed ${ids.length} interrupted stories`)).catch((e) => console.error("[wire] resume failed:", e)), 6 * 60_000).unref();

// Claim vectors for "Verify this" are computed once and kept; do it now so the first visitor does not wait for it.
if (process.env.VERIFY_WARM !== "0") {
  void app.verifier.warm().then(() => console.log("[verify] claim vectors ready")).catch((e) => console.error("[verify] warm-up failed (checks fall back to keywords until it succeeds):", e instanceof Error ? e.message : e));
}

// Local scheduler (Cloud Run uses Cloud Scheduler -> POST /v1/internal/ingest instead).
const every = Number(process.env.INGEST_INTERVAL_MIN ?? 0);
if (every > 0) {
  const tick = () => {
    if (ingestRunning()) return;
    ingestCycle(deps, wire.config, wire.effects)
      .then((r) => console.log(`[wire] ${r.id}: ${r.newLeads} new leads, ${r.ingested} ingested, +${r.storiesCreated.length} stories, ~${r.storiesUpdated.length} updated${r.errors.length ? `, ${r.errors.length} errors` : ""}`))
      .catch((e) => console.error("[wire] cycle failed:", e));
  };
  setTimeout(tick, 5000);
  setInterval(tick, every * 60_000);
  console.log(`[wire] ingesting every ${every} min · markets ${wire.config.markets.join(",")} · auto-publish ${wire.config.autoPublish}`);
}
if (!process.env.ASSETS_BUCKET) app.use("/assets/*", serveStatic({ root: DATA_DIR }));

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () => console.log(`OpenLens api on :${port} (data: ${DATA_DIR})`));
