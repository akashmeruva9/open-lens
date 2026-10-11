import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { resolve } from "node:path";
import { GcsAssets, LocalAssets, type AssetStore } from "./assets.js";
import { createApp } from "./app.js";
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

const app = createApp({ store: await makeStore(), assets: makeAssets(), workDir: WORK_DIR });
if (!process.env.ASSETS_BUCKET) app.use("/assets/*", serveStatic({ root: DATA_DIR }));

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () => console.log(`OpenLens api on :${port} (data: ${DATA_DIR})`));
