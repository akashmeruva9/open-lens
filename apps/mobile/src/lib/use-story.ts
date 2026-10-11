import { useMemo } from 'react';

import { api } from './api';
import { claimMap, sourceMap } from './bundle';
import type { StoryBundle } from './types';
import { useResource } from './use-resource';

/** Loads a story bundle (with offline cache) plus id lookups used by every story sub-screen. */
export function useStory(id: string | undefined) {
  const res = useResource<StoryBundle>(id ? `story:${id}` : null, () => api.story(id ?? ''), [id]);
  const claims = useMemo(() => (res.data ? claimMap(res.data) : new Map()), [res.data]);
  const sources = useMemo(() => (res.data ? sourceMap(res.data) : new Map()), [res.data]);
  return { ...res, claims, sources };
}
