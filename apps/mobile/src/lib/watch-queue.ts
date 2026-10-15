import { router } from 'expo-router';

import type { HomeItem } from './home';

/**
 * In-memory hand-off of the rail the reader tapped, so the vertical watch pager can render
 * instantly. The route also carries the ids, so a cold start / deep link can rebuild the queue.
 */
let queue: HomeItem[] = [];

export function queuedItems(ids: string[]): HomeItem[] | null {
  const byId = new Map(queue.map((i) => [i.id, i]));
  const items = ids.map((id) => byId.get(id)).filter((i): i is HomeItem => !!i);
  return items.length === ids.length ? items : null;
}

export function openWatch(items: HomeItem[], startId: string) {
  const videos = items.filter((i) => i.video);
  if (!videos.length) return;
  queue = videos;
  router.push({ pathname: '/watch', params: { ids: videos.map((v) => v.id).join(','), start: startId } });
}

export const openStory = (id: string) => router.push({ pathname: '/story/[id]', params: { id } });
