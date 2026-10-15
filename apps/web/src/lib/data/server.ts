import { ApiError, createClient, type OpenLensClient } from "@openlens/client";
import type { FeedItem, StoryBundle } from "@openlens/schemas";
import { toCard, type CardItem } from "@/lib/cards";
import { API_URL } from "@/lib/env";

/** Reader-side client for Server Components (public, unauthenticated). */
export function getServerClient(): OpenLensClient {
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

/** Feed as home cards (video details come from `FeedItem.videos`). */
export async function loadCards(): Promise<Result<CardItem[]>> {
  const res = await loadFeed({});
  return res.ok ? { ok: true, data: res.data.map((f) => toCard(f)) } : res;
}
