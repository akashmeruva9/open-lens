// In-memory store backing fixture mode. Studio mutations update it so flows are demoable
// (approve, regenerate, publish, claim edits -> correction propagation). In the browser it is
// mirrored to localStorage so the reader app reflects studio corrections across tabs.
import type { AgentRun, Claim, CorrectionEvent, FeedItem, OutputRecord, Publication, StoryBundle } from "@openlens/schemas";
import { feedItemFromBundle, fixtureRuns, impactedOutputIds } from "./derive";
import { loadFixtureBundles, loadFixtureFeed } from "./fixtures";

const STORAGE_KEY = "openlens:fixture-store:v1";
const clone = <T,>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export class FixtureError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class FixtureStore {
  private bundles = new Map<string, StoryBundle>();
  private baseFeed: FeedItem[];
  private listeners = new Set<() => void>();
  private runs = new Map<string, AgentRun[]>();

  constructor(private persist: boolean) {
    this.baseFeed = loadFixtureFeed();
    this.reset(false);
    if (persist) this.hydrate();
  }

  reset(notify = true) {
    this.bundles.clear();
    for (const b of loadFixtureBundles()) this.bundles.set(b.story.id, b);
    if (notify) {
      this.save();
      this.emit();
    }
  }

  // ---- persistence (browser only, best-effort) ----
  private hydrate() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoryBundle[];
      for (const b of saved) this.bundles.set(b.story.id, b);
    } catch {
      /* storage unavailable or corrupt: keep pristine fixtures */
    }
  }
  private save() {
    if (!this.persist) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.bundles.values()]));
    } catch {
      /* ignore quota / privacy mode */
    }
  }

  /** Re-read persisted state (another tab changed it). */
  syncFromStorage() {
    this.reset(false);
    this.hydrate();
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
  private commit() {
    this.save();
    this.emit();
  }

  // ---- reads ----
  get(id: string): StoryBundle {
    const b = this.bundles.get(id);
    if (!b) throw new FixtureError(404, `story ${id} not found`);
    return b;
  }
  has(id: string) {
    return this.bundles.has(id);
  }
  all(): StoryBundle[] {
    return [...this.bundles.values()].sort((a, b) => b.story.updatedAt.localeCompare(a.story.updatedAt));
  }
  feed(): FeedItem[] {
    const derived = this.all()
      .filter((b) => ["published", "corrected", "approved"].includes(b.story.status))
      .map((b) => {
        const base = this.baseFeed.find((f) => f.id === b.story.id);
        return base ? { ...base, ...feedItemFromBundle(b), title: base.title, summary: base.summary } : feedItemFromBundle(b);
      });
    const extra = this.baseFeed.filter((f) => !this.bundles.has(f.id));
    return [...derived, ...extra];
  }
  runsFor(id: string): AgentRun[] {
    if (!this.runs.has(id)) this.runs.set(id, fixtureRuns(id, this.get(id).story.updatedAt));
    return this.runs.get(id)!;
  }
  findOutput(outputId: string): { bundle: StoryBundle; output: OutputRecord } {
    for (const bundle of this.bundles.values()) {
      const output = bundle.outputs.find((o) => o.id === outputId);
      if (output) return { bundle, output };
    }
    throw new FixtureError(404, `output ${outputId} not found`);
  }

  // ---- mutations ----
  private touch(b: StoryBundle) {
    b.story.updatedAt = now();
  }

  patchClaim(storyId: string, claimId: string, patch: { text?: string; state?: Claim["state"]; reason: string }, by: string) {
    if (!patch.reason?.trim()) throw new FixtureError(400, "reason is required");
    const b = clone(this.get(storyId));
    const claim = b.claims.find((c) => c.id === claimId);
    if (!claim) throw new FixtureError(404, `claim ${claimId} not found`);
    const fromVersion = b.story.version;
    const toVersion = fromVersion + 1;
    if (patch.text !== undefined) claim.text = patch.text;
    if (patch.state !== undefined) claim.state = patch.state;
    claim.stateReason = patch.reason;
    claim.version += 1;
    b.story.version = toVersion;

    const impacted = impactedOutputIds(b.outputs, [claimId]);
    for (const o of b.outputs) {
      if (!impacted.includes(o.id)) continue;
      o.status = "needs_review";
      o.staleReason = `Claim ${claimId} changed in ledger v${toVersion}`;
      o.updatedAt = now();
    }
    const impactedPubs = b.publications.filter((p) => impacted.includes(p.outputId) && p.status === "published");
    for (const p of impactedPubs) p.status = "needs_correction";

    const correction: CorrectionEvent = {
      id: uid("corr"), storyId, at: now(), by, reason: patch.reason, changedClaimIds: [claimId],
      fromVersion, toVersion, impactedOutputIds: impacted, impactedPublicationIds: impactedPubs.map((p) => p.id),
    };
    b.corrections = [correction, ...b.corrections];
    if (b.story.status === "published") b.story.status = "corrected";
    this.touch(b);
    this.bundles.set(storyId, b);
    this.commit();
    return { claim: clone(claim), correction: clone(correction) };
  }

  approveOutput(outputId: string, by: string): OutputRecord {
    const { bundle } = this.findOutput(outputId);
    const b = clone(bundle);
    const o = b.outputs.find((x) => x.id === outputId)!;
    o.status = "approved";
    o.approvedBy = by;
    o.ledgerVersion = b.story.version;
    o.staleReason = undefined;
    o.updatedAt = now();
    this.touch(b);
    this.bundles.set(b.story.id, b);
    this.commit();
    return clone(o);
  }

  regenerate(outputId: string) {
    const { bundle } = this.findOutput(outputId);
    const storyId = bundle.story.id;
    this.mutateOutput(storyId, outputId, (o) => {
      o.status = "qa";
    });
    // Simulate the agent + QA pass finishing.
    setTimeout(() => {
      if (!this.has(storyId)) return;
      const version = this.get(storyId).story.version;
      this.mutateOutput(storyId, outputId, (o) => {
        o.status = "draft";
        o.ledgerVersion = version;
        o.staleReason = undefined;
      });
    }, 1600);
    return { accepted: true as const };
  }

  private mutateOutput(storyId: string, outputId: string, fn: (o: OutputRecord) => void) {
    const b = clone(this.get(storyId));
    const o = b.outputs.find((x) => x.id === outputId);
    if (!o) return;
    fn(o);
    o.updatedAt = now();
    this.bundles.set(storyId, b);
    this.commit();
  }

  publish(outputId: string, mode: "live" | "dry_run", liveChannels: Set<string>, by: string): Publication {
    const { bundle, output } = this.findOutput(outputId);
    if (!["approved", "published", "scheduled"].includes(output.status))
      throw new FixtureError(409, "Output must be approved before publishing");
    if (mode === "live" && !liveChannels.has(output.channel))
      throw new FixtureError(409, `${output.channel} is not connected for live publishing`);
    const b = clone(bundle);
    const o = b.outputs.find((x) => x.id === outputId)!;
    const pub: Publication = {
      id: uid("pub"), storyId: b.story.id, outputId, channel: o.channel, ledgerVersion: b.story.version, mode,
      externalId: mode === "dry_run" ? undefined : uid(o.channel),
      url: mode === "dry_run" ? undefined : `https://openlens.app/story/${b.story.id}`,
      status: "published", publishedAt: now(), approvedBy: o.approvedBy ?? by,
      response: mode === "dry_run" ? { validated: true, note: "Dry run: payload validated, nothing sent" } : { ok: true },
    };
    b.publications = [pub, ...b.publications];
    if (mode === "live") o.status = "published";
    this.touch(b);
    this.bundles.set(b.story.id, b);
    this.commit();
    return clone(pub);
  }

  approveStory(id: string) {
    const b = clone(this.get(id));
    b.story.status = "approved";
    this.touch(b);
    this.bundles.set(id, b);
    this.commit();
    return clone(b.story);
  }

  createStory(input: { title: string; region: string; topics: string[]; languages?: string[]; riskTier?: "low" | "sensitive" }) {
    const id = `story-${Date.now().toString(36)}`;
    const t = now();
    const b: StoryBundle = {
      story: {
        id, title: input.title, summary: "", region: input.region, topics: input.topics,
        languages: input.languages ?? ["en"], riskTier: input.riskTier ?? "low", status: "draft", version: 1, createdAt: t, updatedAt: t,
      },
      sources: [], claims: [], lanes: [], context: [], timeline: [], assessment: null, outputs: [], publications: [], corrections: [],
    };
    this.bundles.set(id, b);
    this.commit();
    return clone(b.story);
  }

  startRun(id: string) {
    const b = clone(this.get(id));
    if (b.story.status === "draft") b.story.status = "researching";
    this.touch(b);
    this.bundles.set(id, b);
    this.commit();
    return { accepted: true as const };
  }
}

let browserStore: FixtureStore | null = null;
/** Singleton per runtime. Server renders get a fresh, pristine store per request. */
export function getFixtureStore(): FixtureStore {
  if (typeof window === "undefined") return new FixtureStore(false);
  if (!browserStore) {
    const store = new FixtureStore(true);
    // Cross-tab sync: a studio tab's edits show up in an open reader tab.
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) store.syncFromStorage();
    });
    browserStore = store;
  }
  return browserStore;
}
