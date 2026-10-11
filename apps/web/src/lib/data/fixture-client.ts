// Implements the exact OpenLensClient surface on top of the in-memory FixtureStore, so every
// component is written against the real client contract and fixture mode is a drop-in swap.
import { ApiError, type OpenLensClient } from "@openlens/client";
import { computeEvals } from "./derive";
import { FixtureError, type FixtureStore } from "./fixture-store";

const CHANNELS = [
  { channel: "app", live: true },
  { channel: "youtube", live: false, reason: "Fixture mode: no YouTube OAuth token" },
  { channel: "x", live: false, reason: "Fixture mode: preview only" },
  { channel: "instagram", live: false, reason: "Fixture mode: preview only" },
  { channel: "facebook", live: false, reason: "Fixture mode: preview only" },
  { channel: "whatsapp", live: false, reason: "Fixture mode: template preview only" },
];
const LIVE = new Set(CHANNELS.filter((c) => c.live).map((c) => c.channel));

/** Small artificial latency so loading states are visible and realistic. */
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

async function wrap<T>(fn: () => T, ms?: number): Promise<T> {
  await delay(ms);
  try {
    return structuredClone(fn());
  } catch (e) {
    if (e instanceof FixtureError) throw new ApiError(e.status, e.message);
    throw e;
  }
}

export function createFixtureClient(store: FixtureStore, opts: { baseUrl: string; user: () => string }): OpenLensClient {
  const base = opts.baseUrl.replace(/\/$/, "");
  return {
    assetUrl: (p: string) => (/^https?:/.test(p) ? p : `${base}${p}`),
    // No SSE in fixture mode; callers must check USE_FIXTURES before opening an EventSource.
    eventsUrl: (storyId: string) => `${base}/v1/stories/${storyId}/events`,

    feed: (q = {}) =>
      wrap(() =>
        store.feed().filter(
          (f) =>
            (!q.lang || f.languages.includes(q.lang)) &&
            (!q.region || f.region === q.region) &&
            (!q.topic || f.topics.includes(q.topic)),
        ),
      0),
    story: (id) => wrap(() => store.get(id), 0),
    subscribe: () => wrap(() => ({ id: `sub-${Date.now()}` })),
    registerDevice: () => wrap(() => ({ id: `dev-${Date.now()}` })),

    studio: {
      stories: () => wrap(() => store.all().map((b) => b.story)),
      story: (id) => wrap(() => store.get(id)),
      create: (b) => wrap(() => store.createStory(b)),
      run: (id) => wrap(() => store.startRun(id)),
      approveStory: (id) => wrap(() => store.approveStory(id)),
      patchClaim: (id, claimId, b) => wrap(() => store.patchClaim(id, claimId, b, opts.user()), 350),
      approveOutput: (outputId) => wrap(() => store.approveOutput(outputId, opts.user())),
      regenerate: (outputId) => wrap(() => store.regenerate(outputId)),
      publish: (outputId, mode = "dry_run") => wrap(() => store.publish(outputId, mode, LIVE, opts.user()), 500),
      evals: (id) => wrap(() => computeEvals(store.get(id), store.runsFor(id))),
      runs: (id) => wrap(() => store.runsFor(id)),
      channels: () => wrap(() => CHANNELS),
    },
  };
}
