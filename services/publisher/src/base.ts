import type { Channel, OutputKind, OutputRecord, Publication } from "@openlens/schemas";
import { formatError, redact } from "./http.js";
import type { ChannelPublisher, PublishContext, PublishOptions, RequestSpec, ValidationResult } from "./types.js";
import { PublishError } from "./types.js";
import { log, newPublication } from "./util.js";

export type Status = { live: boolean; reason?: string };

export interface Prepared<S> {
  requests: RequestSpec[];
  warnings?: string[];
  state: S;
}

export interface ExecResult {
  externalId?: string;
  url?: string;
  response: Record<string, unknown>;
  /** Overrides "published" (e.g. a partially failed thread). */
  status?: Publication["status"];
  error?: string;
}

export interface ChannelSpec<S> {
  channel: Channel;
  kinds: OutputKind[];
  status(): Status;
  /** Channel-specific checks. Common checks (kind, channel) are added by the base. */
  validate(output: OutputRecord, ctx: PublishContext, opts?: PublishOptions): Promise<{ errors: string[]; warnings: string[] }>;
  /** Build the exact requests that would be sent. Must not touch the network. */
  prepare(output: OutputRecord, ctx: PublishContext, opts: PublishOptions): Promise<Prepared<S>>;
  /** Perform the live calls. Upstream failures should throw; the base captures them. */
  execute(prep: Prepared<S>, output: OutputRecord, ctx: PublishContext, opts: PublishOptions): Promise<ExecResult>;
  update: ChannelPublisher["update"];
  retract: ChannelPublisher["retract"];
}

/** Output statuses that represent an editor-approved item. "scheduled" is approved + queued. */
const PUBLISHABLE = new Set(["approved", "scheduled"]);

export function definePublisher<S>(spec: ChannelSpec<S>): ChannelPublisher {
  async function validate(output: OutputRecord, ctx: PublishContext, opts?: PublishOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (output.channel !== spec.channel) errors.push(`output ${output.id} targets channel ${output.channel}, not ${spec.channel}`);
    if (!spec.kinds.includes(output.kind)) errors.push(`${spec.channel} cannot publish output kind "${output.kind}" (supported: ${spec.kinds.join(", ")})`);
    if (output.staleReason) warnings.push(`output is marked stale: ${output.staleReason}`);
    if (errors.length === 0) {
      try {
        const r = await spec.validate(output, ctx, opts);
        errors.push(...r.errors);
        warnings.push(...r.warnings);
      } catch (err) {
        errors.push(`validation crashed: ${formatError(err)}`);
      }
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  async function publish(output: OutputRecord, ctx: PublishContext, opts: PublishOptions): Promise<Publication> {
    if (output.channel !== spec.channel) {
      throw new PublishError("wrong_channel", `output ${output.id} targets ${output.channel}, not ${spec.channel}`);
    }
    if (!PUBLISHABLE.has(output.status)) {
      throw new PublishError("not_approved", `refusing to publish output ${output.id}: status is "${output.status}", must be "approved"`);
    }
    const st = spec.status();
    if (opts.mode === "live" && !st.live) {
      throw new PublishError("not_live", `${spec.channel} is not configured for live publishing (${st.reason ?? "no credentials"}); use mode "dry_run"`);
    }

    const validation = await validate(output, ctx, opts);
    if (!validation.ok) {
      if (opts.mode === "live") {
        throw new PublishError("validation_failed", `${spec.channel} validation failed: ${validation.errors.join("; ")}`, validation);
      }
      const pub = newPublication(output, ctx, "dry_run", {
        status: "failed",
        error: `validation failed: ${validation.errors.join("; ")}`,
        response: { dryRun: true, validation },
      });
      log("publish.dry_run.invalid", { channel: spec.channel, outputId: output.id, errors: validation.errors });
      return pub;
    }

    const prep = await spec.prepare(output, ctx, opts);
    const warnings = [...validation.warnings, ...(prep.warnings ?? [])];

    if (opts.mode === "dry_run") {
      const pub = newPublication(output, ctx, "dry_run", {
        status: "published",
        response: {
          dryRun: true,
          live: st.live,
          ...(st.reason ? { liveReason: st.reason } : {}),
          scheduleAt: opts.scheduleAt,
          requests: prep.requests,
          warnings,
        },
      });
      log("publish.dry_run", { channel: spec.channel, outputId: output.id, requests: prep.requests.length });
      return pub;
    }

    try {
      const res = await spec.execute(prep, output, ctx, opts);
      const pub = newPublication(output, ctx, "live", {
        status: res.status ?? "published",
        externalId: res.externalId,
        url: res.url,
        error: res.error,
        response: { ...res.response, scheduleAt: opts.scheduleAt, warnings },
      });
      log("publish.live", { channel: spec.channel, outputId: output.id, externalId: pub.externalId, status: pub.status, error: pub.error });
      return pub;
    } catch (err) {
      const error = formatError(err);
      log("publish.live.failed", { channel: spec.channel, outputId: output.id, error });
      return newPublication(output, ctx, "live", {
        status: "failed",
        error,
        response: { requests: prep.requests, warnings, ...(errBody(err) ? { upstream: errBody(err) } : {}) },
      });
    }
  }

  return {
    channel: spec.channel,
    status: spec.status,
    validate: (output, ctx) => validate(output, ctx),
    publish,
    update: spec.update,
    retract: spec.retract,
  };
}

function errBody(err: unknown): unknown {
  return err && typeof err === "object" && "body" in err ? (err as { body: unknown }).body : undefined;
}

/**
 * Shared flow for update/retract: dry-run publications are simulated (no network), live ones
 * require credentials. On upstream failure the publication is flagged needs_correction.
 */
export async function runFollowUp(opts: {
  pub: Publication;
  action: "update" | "retract";
  requests: RequestSpec[];
  status: Status;
  channel: Channel;
  onSuccess: Publication["status"];
  ledgerVersion?: number;
  run: () => Promise<Record<string, unknown>>;
}): Promise<Publication> {
  const { pub, action, requests } = opts;
  const historyKey = action === "update" ? "corrections" : "retractions";
  const history = Array.isArray(pub.response?.[historyKey]) ? (pub.response![historyKey] as unknown[]) : [];
  const at = new Date().toISOString();

  if (pub.mode === "dry_run") {
    return {
      ...pub,
      status: opts.onSuccess,
      ledgerVersion: opts.ledgerVersion ?? pub.ledgerVersion,
      response: redact({ ...(pub.response ?? {}), [historyKey]: [...history, { at, dryRun: true, requests }] }),
    };
  }
  if (!opts.status.live) {
    throw new PublishError("not_live", `${opts.channel} is not configured for live ${action} (${opts.status.reason ?? "no credentials"})`);
  }
  try {
    const result = await opts.run();
    log(`${action}.live`, { channel: opts.channel, publicationId: pub.id, externalId: pub.externalId });
    return {
      ...pub,
      status: opts.onSuccess,
      error: undefined,
      ledgerVersion: opts.ledgerVersion ?? pub.ledgerVersion,
      response: redact({ ...(pub.response ?? {}), [historyKey]: [...history, { at, requests, result }] }),
    };
  } catch (err) {
    const error = formatError(err);
    log(`${action}.live.failed`, { channel: opts.channel, publicationId: pub.id, error });
    return {
      ...pub,
      status: "needs_correction",
      error,
      response: redact({ ...(pub.response ?? {}), [historyKey]: [...history, { at, requests, error }] }),
    };
  }
}

/** For channels where an action is impossible via API: flag for manual handling, never pretend. */
export function manualFollowUp(pub: Publication, action: "update" | "retract", reason: string): Publication {
  const historyKey = action === "update" ? "corrections" : "retractions";
  const history = Array.isArray(pub.response?.[historyKey]) ? (pub.response![historyKey] as unknown[]) : [];
  return {
    ...pub,
    status: "needs_correction",
    error: reason,
    response: { ...(pub.response ?? {}), [historyKey]: [...history, { at: new Date().toISOString(), manual: true, reason }] },
  };
}
