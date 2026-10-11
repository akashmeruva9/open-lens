"use client";
import { createClient, type OpenLensClient } from "@openlens/client";
import { StoryEventMsg, type StoryBundle } from "@openlens/schemas";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { API_URL, DEV_USER, USE_FIXTURES } from "@/lib/env";
import { createFixtureClient } from "./fixture-client";
import { getFixtureStore } from "./fixture-store";

const ClientContext = createContext<OpenLensClient | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { getToken, user } = useAuth();
  const userRef = useRef(user?.email ?? DEV_USER);
  userRef.current = user?.email ?? DEV_USER;

  const client = useMemo<OpenLensClient>(() => {
    if (USE_FIXTURES) return createFixtureClient(getFixtureStore(), { baseUrl: API_URL, user: () => userRef.current });
    return createClient({ baseUrl: API_URL, getToken, devUser: DEV_USER });
  }, [getToken]);

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): OpenLensClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error("useClient must be used inside <DataProvider>");
  return c;
}

/** Fires `onChange` whenever fixture data changes (fixture mode only). */
export function useFixtureChanges(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!USE_FIXTURES) return;
    return getFixtureStore().subscribe(() => cb.current());
  }, []);
}

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    try {
      const v = await fnRef.current();
      setData(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useFixtureChanges(() => void reload());
  return { data, error, loading, reload };
}

/** Studio bundle with live updates (store changes in fixture mode, SSE in real mode). */
export function useStudioBundle(id: string) {
  const client = useClient();
  const state = useLoad<StoryBundle>(() => client.studio.story(id), [client, id]);
  const events = useStoryEvents(id, () => void state.reload());
  return { ...state, events };
}

export interface StageEvent { stage: string; status: "started" | "done" | "failed"; detail?: string; at: number }

/** Subscribes to the pipeline SSE stream (real mode only; no-op with fixtures). */
export function useStoryEvents(storyId: string | null, onAny?: (m: StoryEventMsg) => void) {
  const client = useClient();
  const [stages, setStages] = useState<Record<string, StageEvent>>({});
  const [connected, setConnected] = useState(false);
  const cb = useRef(onAny);
  cb.current = onAny;

  useEffect(() => {
    if (USE_FIXTURES || !storyId || typeof EventSource === "undefined") return;
    // TODO(api-auth): EventSource cannot send headers; the API should accept ?token= for studio SSE.
    const es = new EventSource(client.eventsUrl(storyId));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      let msg: StoryEventMsg;
      try {
        msg = StoryEventMsg.parse(JSON.parse(ev.data));
      } catch {
        return;
      }
      if (msg.type === "stage") {
        const m = msg;
        setStages((s) => ({ ...s, [m.stage]: { stage: m.stage, status: m.status, detail: m.detail, at: Date.now() } }));
      }
      cb.current?.(msg);
    };
    return () => es.close();
  }, [client, storyId]);

  return { stages, connected, live: !USE_FIXTURES };
}
