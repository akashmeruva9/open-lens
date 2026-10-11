import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OutputRecord } from "@openlens/schemas";
import type { PublishContext } from "../types.js";

process.env.PUBLISHER_LOG = "silent";
process.env.PUBLISHER_RETRY_BASE_MS = "1";
process.env.IG_POLL_INTERVAL_MS = "1";
process.env.WA_SEND_INTERVAL_MS = "0";

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Parsed JSON or form body when applicable. */
  json?: any;
  form?: Record<string, string>;
}

export type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };

/** Replace global fetch with a recording handler. Any unhandled call throws (fails the test). */
export function mockFetch(handler: (c: Call, index: number) => Reply | Promise<Reply>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call: Call = { method: init?.method ?? "GET", url: String(input), headers, body: init?.body };
    if (typeof init?.body === "string") {
      if (headers["content-type"]?.includes("json")) call.json = JSON.parse(init.body);
      if (headers["content-type"]?.includes("x-www-form-urlencoded")) call.form = Object.fromEntries(new URLSearchParams(init.body));
    }
    calls.push(call);
    const r = await handler(call, calls.length - 1);
    const body = r.json !== undefined ? JSON.stringify(r.json) : (r.text ?? "");
    return new Response(r.status === 204 ? null : body, {
      status: r.status ?? 200,
      headers: { ...(r.json !== undefined ? { "content-type": "application/json" } : {}), ...(r.headers ?? {}) },
    });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

/** A fetch that fails the test if called (dry_run must never touch the network). */
export function forbidNetwork() {
  return mockFetch((c) => {
    throw new Error(`unexpected network call: ${c.method} ${c.url}`);
  });
}

const CHANNEL_ENV = [
  "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_REFRESH_TOKEN_REGIONAL",
  "YOUTUBE_REFRESH_TOKEN_NATIONAL", "YOUTUBE_REFRESH_TOKEN_INTERNATIONAL", "YOUTUBE_PRIVACY_STATUS",
  "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET", "X_OAUTH2_USER_TOKEN", "X_MEDIA_UPLOAD",
  "IG_USER_ID", "META_PAGE_ACCESS_TOKEN", "FB_PAGE_ID", "WA_PHONE_NUMBER_ID", "WA_ACCESS_TOKEN", "WA_TEMPLATES",
  "WA_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET", "FCM_PROJECT_ID",
];

/** Run with exactly these channel env vars set (all others cleared), then restore. */
export async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of new Set([...CHANNEL_ENV, ...Object.keys(vars)])) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

export const STORY_URL = "https://openlens.app/story/sample-metro-fare";

const dir = mkdtempSync(join(tmpdir(), "openlens-pub-"));
export const LOCAL_VIDEO = join(dir, "video.mp4");
export const LOCAL_VTT = join(dir, "captions.vtt");
writeFileSync(LOCAL_VIDEO, Buffer.from("fake-mp4-bytes"));
writeFileSync(LOCAL_VTT, "WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n");

export function output(partial: Partial<OutputRecord> & Pick<OutputRecord, "id" | "kind" | "channel" | "payload">): OutputRecord {
  return {
    storyId: "sample-metro-fare",
    lang: "en",
    claimIds: ["c1"],
    ledgerVersion: 1,
    status: "approved",
    aiDisclosure: true,
    dependsOn: [],
    createdAt: "2026-10-12T10:00:00Z",
    updatedAt: "2026-10-12T10:00:00Z",
    ...partial,
  };
}

export function video(id = "video-en-916", payload: Partial<Record<string, unknown>> = {}): OutputRecord {
  return output({
    id,
    kind: "video",
    channel: "app",
    payload: {
      aspect: "9:16",
      mp4Url: "/assets/sample-metro-fare/video-en-916.mp4",
      captionsVttUrl: "/assets/sample-metro-fare/video-en-916.vtt",
      durationSeconds: 24,
      scriptOutputId: "script-en",
      ...payload,
    },
  });
}

export function ctx(outputs: OutputRecord[] = [video()], extra: Partial<PublishContext> = {}): PublishContext {
  const byId = new Map(outputs.map((o) => [o.id, o]));
  return {
    getOutput: async (id) => byId.get(id),
    resolveAsset: async (path, { public: pub }) => (pub ? `https://storage.test${path}` : path.endsWith(".vtt") ? LOCAL_VTT : LOCAL_VIDEO),
    approvedBy: "editor@openlens.app",
    storyUrl: STORY_URL,
    ...extra,
  };
}
