import type {
  AgentRun, CorrectionEvent, Publication, QaFlag, Story, StoryBundle,
} from "@openlens/schemas";
import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

/** Everything persisted per story (bundle + ops data that readers don't see). */
export interface StoryRecord extends StoryBundle {
  qaFlags: QaFlag[];
  runs: AgentRun[];
  grounded: boolean;
  claimsDropped: number;
}

export interface Subscriber { id: string; phone: string; lang: string; region: string; topics: string[]; consentAt: string }
export interface Device { id: string; token: string; platform: string; lang: string; region?: string; topics?: string[]; at: string }

export interface Store {
  listStories(): Promise<Story[]>;
  get(id: string): Promise<StoryRecord | undefined>;
  put(rec: StoryRecord): Promise<void>;
  addSubscriber(s: Subscriber): Promise<void>;
  listSubscribers(): Promise<Subscriber[]>;
  addDevice(d: Device): Promise<void>;
  removeSubscriber(phone: string): Promise<void>;
  removeDevice(token: string): Promise<void>;
}

export function emptyRecord(story: Story): StoryRecord {
  return {
    story, sources: [], claims: [], lanes: [], context: [], timeline: [], assessment: null,
    outputs: [], publications: [], corrections: [], qaFlags: [], runs: [], grounded: false, claimsDropped: 0,
  };
}

/** Local dev store: one JSON file per story under DATA_DIR. Writes are atomic (tmp + rename). */
export class FileStore implements Store {
  constructor(private dir: string) {}
  private async ensure() {
    await mkdir(join(this.dir, "stories"), { recursive: true });
  }
  private async writeJson(path: string, v: unknown) {
    await this.ensure();
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(v, null, 2));
    await rename(tmp, path);
  }
  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
      return fallback;
    }
  }
  async listStories() {
    await this.ensure();
    const files = (await readdir(join(this.dir, "stories"))).filter((f) => f.endsWith(".json"));
    const recs = await Promise.all(files.map((f) => this.readJson<StoryRecord | null>(join(this.dir, "stories", f), null)));
    return recs.filter((r): r is StoryRecord => Boolean(r)).map((r) => r.story);
  }
  get(id: string) {
    return this.readJson<StoryRecord | undefined>(join(this.dir, "stories", `${encodeURIComponent(id)}.json`), undefined);
  }
  put(rec: StoryRecord) {
    return this.writeJson(join(this.dir, "stories", `${encodeURIComponent(rec.story.id)}.json`), rec);
  }
  async addSubscriber(s: Subscriber) {
    const all = await this.listSubscribers();
    await this.writeJson(join(this.dir, "subscribers.json"), [...all.filter((x) => x.phone !== s.phone), s]);
  }
  listSubscribers() {
    return this.readJson<Subscriber[]>(join(this.dir, "subscribers.json"), []);
  }
  async removeSubscriber(phone: string) {
    await this.writeJson(join(this.dir, "subscribers.json"), (await this.listSubscribers()).filter((x) => x.phone !== phone));
  }
  async removeDevice(token: string) {
    const all = await this.readJson<Device[]>(join(this.dir, "devices.json"), []);
    await this.writeJson(join(this.dir, "devices.json"), all.filter((x) => x.token !== token));
  }
  async addDevice(d: Device) {
    const all = await this.readJson<Device[]>(join(this.dir, "devices.json"), []);
    await this.writeJson(join(this.dir, "devices.json"), [...all.filter((x) => x.token !== d.token), d]);
  }
}

/**
 * Firestore store. Layout follows plan.md §4: stories/{id} holds the story doc;
 * ledger arrays live in subcollections so they can be queried and secured separately.
 */
export class FirestoreStore implements Store {
  private db: import("firebase-admin/firestore").Firestore;
  static readonly SUB = ["sources", "claims", "lanes", "context", "timeline", "outputs", "publications", "corrections", "runs"] as const;

  constructor(db: import("firebase-admin/firestore").Firestore) {
    this.db = db;
  }
  async listStories() {
    const snap = await this.db.collection("stories").get();
    return snap.docs.map((d) => d.data().story as Story);
  }
  async get(id: string): Promise<StoryRecord | undefined> {
    const ref = this.db.collection("stories").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return undefined;
    const head = doc.data()!;
    const subs = await Promise.all(
      FirestoreStore.SUB.map(async (c) => {
        const s = await ref.collection(c).orderBy("_i").get();
        return [c, s.docs.map((d) => { const { _i, ...rest } = d.data(); return rest; })] as const;
      }),
    );
    return { ...head, ...Object.fromEntries(subs) } as unknown as StoryRecord;
  }
  async put(rec: StoryRecord) {
    const ref = this.db.collection("stories").doc(rec.story.id);
    const { story, assessment, qaFlags, grounded, claimsDropped } = rec;
    let batch = this.db.batch();
    let n = 0;
    const flush = async () => {
      if (n) await batch.commit();
      batch = this.db.batch();
      n = 0;
    };
    batch.set(ref, JSON.parse(JSON.stringify({ story, assessment, qaFlags, grounded, claimsDropped })));
    n++;
    for (const c of FirestoreStore.SUB) {
      const items = (rec[c] as { id?: string }[]) ?? [];
      const existing = await ref.collection(c).listDocuments();
      const keep = new Set(items.map((it, i) => it.id ?? String(i)));
      for (const d of existing) if (!keep.has(d.id)) { batch.delete(d); if (++n >= 450) await flush(); }
      for (const [i, it] of items.entries()) {
        batch.set(ref.collection(c).doc(it.id ?? String(i)), JSON.parse(JSON.stringify({ ...it, _i: i })));
        if (++n >= 450) await flush();
      }
    }
    await flush();
  }
  async addSubscriber(s: Subscriber) {
    await this.db.collection("subscribers").doc(s.id).set(s);
  }
  async listSubscribers() {
    return (await this.db.collection("subscribers").get()).docs.map((d) => d.data() as Subscriber);
  }
  async addDevice(d: Device) {
    await this.db.collection("devices").doc(d.id).set(d);
  }
  async removeSubscriber(phone: string) {
    const snap = await this.db.collection("subscribers").where("phone", "==", phone).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  async removeDevice(token: string) {
    const snap = await this.db.collection("devices").where("token", "==", token).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

export type { CorrectionEvent, Publication };
