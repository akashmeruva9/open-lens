import { ApiError, createClient, type OpenLensClient } from "@openlens/client";
import type { FeedItem, StoryBundle } from "@openlens/schemas";
import { toCard, type CardItem } from "@/lib/cards";
import { API_URL, USE_FIXTURES } from "@/lib/env";
import { createFixtureClient } from "./fixture-client";
import { FixtureStore } from "./fixture-store";

/** Reader-side client for Server Components (public, unauthenticated). */
export function getServerClient(): OpenLensClient {
  if (USE_FIXTURES) return createFixtureClient(new FixtureStore(false), { baseUrl: API_URL, user: () => "reader" });
  return createClient({ baseUrl: API_URL });
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function settle<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, status: e.status, message: e.message };
    return { ok: false, status: 503, message: e instanceof Error ? e.message : "API unreachable" };
  }
}

export const loadFeed = (q: { lang?: string; region?: string; topic?: string }): Promise<Result<FeedItem[]>> =>
  settle(getServerClient().feed(q));

export const loadStory = (id: string): Promise<Result<StoryBundle>> => settle(getServerClient().story(id));

/**
 * Feed as home cards. Fixture mode enriches each card from its bundle (durations, languages,
 * thumbnails); real mode uses the public feed unchanged (only `videoUrl` is known per item).
 */
export async function loadCards(): Promise<Result<CardItem[]>> {
  if (USE_FIXTURES) {
    return settle(
      (async () => {
        const store = new FixtureStore(false);
        return store.feed().map((f) => toCard(f, store.has(f.id) ? store.get(f.id) : undefined));
      })(),
    );
  }
  const res = await loadFeed({});
  return res.ok ? { ok: true, data: res.data.map((f) => toCard(f)) } : res;
}
