import { createClient, type FeedQuery } from '@openlens/client';

import { API_URL } from './env';
import type { FeedItem, StoryBundle } from './types';

export const client = createClient({ baseUrl: API_URL });

/** Resolve a relative media path (/assets/...) against the API origin. */
export const assetUrl = (path: string) => client.assetUrl(path);

export const api = {
  feed: (q: FeedQuery = {}): Promise<FeedItem[]> => client.feed(q),

  story: (id: string): Promise<StoryBundle> => client.story(id),

  subscribe: (b: { phone: string; lang: string; region: string; topics: string[]; consent: true }) => client.subscribe(b),

  registerDevice: (b: { token: string; platform: 'ios' | 'android' | 'web'; lang: string; region?: string; topics?: string[] }) =>
    client.registerDevice(b),
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
