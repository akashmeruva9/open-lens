import { createClient, type FeedQuery } from '@openlens/client';

import feedFixture from '../../../../data/fixtures/feed.json';
import bundleFixture from '../../../../data/fixtures/story-bundle.json';

import { API_URL, USE_FIXTURES } from './env';
import type { FeedItem, StoryBundle } from './types';

export const client = createClient({ baseUrl: API_URL });

/** Resolve a relative media path (/assets/...) against the API origin. */
export const assetUrl = (path: string) => client.assetUrl(path);

const fixtureFeed = feedFixture as unknown as FeedItem[];
const fixtureBundles: Record<string, StoryBundle> = {
  [(bundleFixture as unknown as StoryBundle).story.id]: bundleFixture as unknown as StoryBundle,
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function matches(item: FeedItem, q: FeedQuery) {
  if (q.lang && !item.languages.includes(q.lang)) return false;
  if (q.region && item.region !== q.region && !item.region.startsWith(`${q.region}-`)) return false;
  if (q.topic && !item.topics.includes(q.topic)) return false;
  return true;
}

export const api = {
  mode: USE_FIXTURES ? ('fixtures' as const) : ('live' as const),

  async feed(q: FeedQuery = {}): Promise<FeedItem[]> {
    if (USE_FIXTURES) {
      await delay(150);
      return fixtureFeed.filter((i) => matches(i, q));
    }
    return client.feed(q);
  },

  async story(id: string): Promise<StoryBundle> {
    if (USE_FIXTURES) {
      await delay(150);
      const b = fixtureBundles[id];
      if (!b) throw new Error(`Story "${id}" is not in the offline fixtures.`);
      return b;
    }
    return client.story(id);
  },

  async subscribe(b: { phone: string; lang: string; region: string; topics: string[]; consent: true }) {
    if (USE_FIXTURES) {
      await delay(400);
      return { id: `fixture-sub-${Date.now()}` };
    }
    return client.subscribe(b);
  },

  async registerDevice(b: { token: string; platform: 'ios' | 'android' | 'web'; lang: string; region?: string; topics?: string[] }) {
    if (USE_FIXTURES) {
      await delay(200);
      return { id: `fixture-device-${Date.now()}` };
    }
    return client.registerDevice(b);
  },
};

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'status' in e) {
    const status = (e as { status: number }).status;
    if (status === 404) return 'This story could not be found.';
    if (status >= 500) return 'The newsroom server is having trouble. Please try again.';
  }
  if (e instanceof Error) {
    if (/Network request failed|Failed to fetch/i.test(e.message)) return `Can't reach ${API_URL}. Check your connection.`;
    return e.message;
  }
  return 'Something went wrong.';
}
