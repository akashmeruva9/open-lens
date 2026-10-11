import type { Channel, OutputRecord, Publication } from "@openlens/schemas";

export interface PublishContext {
  /** Resolve another output (e.g. the video referenced by videoOutputId). */
  getOutput(id: string): Promise<OutputRecord | undefined>;
  /** Absolute local path or public https URL for a media asset path like /assets/... */
  resolveAsset(path: string, opts: { public: boolean }): Promise<string>;
  approvedBy: string;
  /** e.g. https://openlens.app/story/{id} */
  storyUrl: string;
  /**
   * Optional (extension): human-readable correction text used by update().
   * Falls back to a generic "updated after a correction" note.
   */
  correctionNote?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface PublishOptions {
  mode: "live" | "dry_run";
  /** ISO-8601. Native scheduling on YouTube (publishAt) and Facebook (scheduled_publish_time) only. */
  scheduleAt?: string;
  /**
   * WhatsApp only (extension): E.164 numbers of opted-in subscribers. The api is responsible for
   * selecting ONLY subscribers with a recorded consent timestamp. Required for live WhatsApp sends.
   */
  recipients?: string[];
}

export interface ChannelPublisher {
  channel: Channel;
  /** live = credentials present and configured. */
  status(): { live: boolean; reason?: string };
  validate(output: OutputRecord, ctx: PublishContext): Promise<ValidationResult>;
  publish(output: OutputRecord, ctx: PublishContext, opts: PublishOptions): Promise<Publication>;
  /** Corrections. */
  update(pub: Publication, output: OutputRecord, ctx: PublishContext): Promise<Publication>;
  retract(pub: Publication, ctx: PublishContext): Promise<Publication>;
}

export type PublishErrorCode =
  | "not_live"
  | "not_approved"
  | "validation_failed"
  | "wrong_channel"
  | "unsupported"
  | "bad_request";

/** Thrown for refusals (never for upstream API failures, which land in Publication.error). */
export class PublishError extends Error {
  constructor(
    public readonly code: PublishErrorCode,
    message: string,
    public readonly details?: { errors?: string[]; warnings?: string[] },
  ) {
    super(message);
    this.name = "PublishError";
  }
}

/** A request the publisher would send (or did send). Never contains credentials. */
export interface RequestSpec {
  step: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** How the request is authenticated (descriptor only, no secret). */
  auth?: string;
}
