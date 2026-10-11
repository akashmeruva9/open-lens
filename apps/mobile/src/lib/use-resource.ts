import { useCallback, useEffect, useRef, useState } from 'react';

import { readJson, writeJson } from './storage';

export type Resource<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
  /** True when `data` came from the offline cache because the network call failed. */
  stale: boolean;
  reload: () => void;
};

/**
 * Fetch with an AsyncStorage-backed offline cache. Cached data is shown immediately
 * and replaced when the network responds; on failure the cache stays visible.
 */
export function useResource<T>(cacheKey: string | null, fetcher: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setError(null);
      if (nonce > 0) setRefreshing(true);
      else setLoading(true);
      if (cacheKey && !hasData.current) {
        const cached = await readJson<T>(cacheKey);
        if (alive && cached && !hasData.current) {
          setData(cached);
          setLoading(false);
        }
      }
      try {
        const fresh = await fetcherRef.current();
        if (!alive) return;
        hasData.current = true;
        setData(fresh);
        setStale(false);
        if (cacheKey) void writeJson(cacheKey, fresh);
      } catch (e) {
        if (!alive) return;
        setError(e);
        setStale(true);
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, refreshing, stale, reload };
}
