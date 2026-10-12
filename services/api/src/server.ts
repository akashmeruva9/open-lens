import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { resolve } from "node:path";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { createApp } from "./app.js";
import { defaultEffects, ingestCycle, ingestRunning, loadIngestConfig } from "./ingest.js";
import { FileStore, FirestoreStore, type Store } from "./store.js";

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
