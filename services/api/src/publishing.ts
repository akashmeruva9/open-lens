import type { Channel, OutputRecord, Publication } from "@openlens/schemas";

// Contract implemented by @openlens/publisher (see plan.md §7). Loaded lazily so the
// api runs (dry-run only) even if the publisher package is not installed.
export interface PublishContext {
  getOutput(id: string): Promise<OutputRecord | undefined>;
  resolveAsset(path: string, opts: { public: boolean }): Promise<string>;
  approvedBy: string;
  storyUrl: string;
}
export interface ChannelPublisher {
  channel: Channel;
  status(): { live: boolean; reason?: string };
  validate(o: OutputRecord, ctx: PublishContext): Promise<{ ok: boolean; errors: string[]; warnings: string[] }>;
  publish(o: OutputRecord, ctx: PublishContext, opts: { mode: "live" | "dry_run"; scheduleAt?: string; recipients?: string[] }): Promise<Publication>;
  update(p: Publication, o: OutputRecord, ctx: PublishContext): Promise<Publication>;
  retract(p: Publication, ctx: PublishContext): Promise<Publication>;
}
interface PublisherModule {
  getPublisher(c: Channel): ChannelPublisher;
  channelStatuses(): { channel: Channel; live: boolean; reason?: string }[];
  sendPush(o: { topic: string; title: string; body: string; data?: Record<string, string> }): Promise<{ sent: boolean; reason?: string }>;
}

let mod: PublisherModule | null | undefined;
export async function publisher(): Promise<PublisherModule | null> {
  if (mod !== undefined) return mod;
  try {
    mod = (await import("@openlens/publisher" as string)) as PublisherModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** Fallback when the publisher package is absent: records a dry run with the would-be payload. */
export function fallbackDryRun(o: OutputRecord, approvedBy: string): Publication {
  return {
    id: `pub-${Date.now().toString(36)}`,
    storyId: o.storyId,
    outputId: o.id,
    channel: o.channel,
    ledgerVersion: o.ledgerVersion,
    mode: "dry_run",
    status: "published",
    publishedAt: new Date().toISOString(),
    approvedBy,
    response: { note: "publisher package not installed; payload recorded only", payload: o.payload },
  };
}
