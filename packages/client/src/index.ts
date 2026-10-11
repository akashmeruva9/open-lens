// Typed REST client shared by the web app, studio and the Expo mobile app.
// Uses only fetch, so it runs in browsers, React Native and Node.
import type {
  AgentRun, Claim, CorrectionEvent, EvalReport, EvidenceState, FeedItem, OutputRecord,
  Publication, SourceRecord, Story, StoryBundle,
} from "@openlens/schemas";

export interface ClientOptions {
  baseUrl: string;
  /** Returns a Firebase ID token (studio). Omit for public reader calls. */
  getToken?: () => Promise<string | null>;
  /** Local dev only: sent as x-dev-user when no token is available. */
  devUser?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface FeedQuery { lang?: string; region?: string; topic?: string }
export interface CreateStoryInput {
  title: string;
  region: string;
  topics: string[];
  languages?: string[];
  riskTier?: "low" | "sensitive";
  sources: Omit<SourceRecord, "storyId">[];
}
export interface ClaimPatch { text?: string; state?: EvidenceState; reason: string }

export function createClient(opts: ClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = opts.getToken ? await opts.getToken() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    else if (opts.devUser) headers["x-dev-user"] = opts.devUser;
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  const qs = (q: object) => {
    const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== "");
    return p.length ? `?${new URLSearchParams(p as [string, string][])}` : "";
  };

  return {
    /** Absolute URL for an asset path returned by the API (e.g. /assets/...). */
    assetUrl: (p: string) => (/^https?:/.test(p) ? p : `${base}${p}`),
    /** URL for the SSE stream; use with EventSource (web) or a polyfill (RN). */
    eventsUrl: (storyId: string) => `${base}/v1/stories/${storyId}/events`,

    // ---- Reader (public) ----
    feed: (q: FeedQuery = {}) => req<FeedItem[]>("GET", `/v1/feed${qs(q)}`),
    story: (id: string) => req<StoryBundle>("GET", `/v1/stories/${id}`),
    subscribe: (b: { phone: string; lang: string; region: string; topics: string[]; consent: true }) =>
      req<{ id: string }>("POST", "/v1/subscribers", b),
    registerDevice: (b: { token: string; platform: "ios" | "android" | "web"; lang: string; region?: string; topics?: string[] }) =>
      req<{ id: string }>("POST", "/v1/devices", b),

    // ---- Studio (auth) ----
    studio: {
      stories: () => req<Story[]>("GET", "/v1/studio/stories"),
      story: (id: string) => req<StoryBundle>("GET", `/v1/studio/stories/${id}`),
      create: (b: CreateStoryInput) => req<Story>("POST", "/v1/studio/stories", b),
      run: (id: string, stages?: string[]) => req<{ accepted: true }>("POST", `/v1/studio/stories/${id}/run`, { stages }),
      approveStory: (id: string) => req<Story>("POST", `/v1/studio/stories/${id}/approve`, {}),
      patchClaim: (id: string, claimId: string, b: ClaimPatch) =>
        req<{ claim: Claim; correction: CorrectionEvent }>("PATCH", `/v1/studio/stories/${id}/claims/${claimId}`, b),
      approveOutput: (outputId: string) => req<OutputRecord>("POST", `/v1/studio/outputs/${outputId}/approve`, {}),
      regenerate: (outputId: string) => req<{ accepted: true }>("POST", `/v1/studio/outputs/${outputId}/regenerate`, {}),
      publish: (outputId: string, mode: "live" | "dry_run" = "dry_run") =>
        req<Publication>("POST", `/v1/studio/outputs/${outputId}/publish`, { mode }),
      evals: (id: string) => req<EvalReport>("GET", `/v1/studio/stories/${id}/evals`),
      runs: (id: string) => req<AgentRun[]>("GET", `/v1/studio/stories/${id}/runs`),
      channels: () => req<{ channel: string; live: boolean; reason?: string }[]>("GET", "/v1/studio/channels"),
    },
  };
}
export type OpenLensClient = ReturnType<typeof createClient>;
