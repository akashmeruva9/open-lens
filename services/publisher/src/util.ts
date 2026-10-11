import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";
import { VideoPayload, type OutputRecord, type Publication } from "@openlens/schemas";
import type { z } from "zod";
import { env } from "./env.js";
import { http, redact } from "./http.js";
import type { PublishContext } from "./types.js";

export type Video = z.infer<typeof VideoPayload>;

// ---------- AI disclosure ----------
const DISCLOSURE_PATTERNS: RegExp[] = [
  /\bAI[- ]?(generated|assisted|created|made|produced|presenter|narrat\w*|voice|anchor|avatar)\b/i,
  /\b(generated|made|created|produced|narrated|voiced) (with|by|using) AI\b/i,
  /\bsynthetic (media|presenter|voice|narration|video)\b/i,
  /#AI(generated|content)?\b/i,
  /\bartificial intelligence\b/i,
  /\b(generad[oa]|cread[oa]|narrad[oa]) (con|por) (la )?IA\b/i,
  /\binteligencia artificial\b/i,
  /एआई|कृत्रिम बुद्धि|AI द्वारा/,
  /ఏఐ|కృత్రిమ మేధ|AI తో|AI ద్వారా/,
];

export function hasAiDisclosure(text: string): boolean {
  return DISCLOSURE_PATTERNS.some((re) => re.test(text));
}

// ---------- X weighted length (twitter-text v3 approximation) ----------
const X_URL_RE = /https?:\/\/[^\s]+/gi;
const X_LIGHT_RANGES: [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Weighted length per twitter-text v3: URLs = 23, emoji = 2, CJK etc. = 2, Latin/Indic = 1. */
export function xWeightedLength(text: string): number {
  let len = 0;
  const withoutUrls = text.normalize("NFC").replace(X_URL_RE, () => {
    len += 23;
    return "";
  });
  for (const { segment } of segmenter.segment(withoutUrls)) {
    if (/\p{Extended_Pictographic}/u.test(segment)) {
      len += 2;
      continue;
    }
    for (const ch of segment) {
      const cp = ch.codePointAt(0)!;
      len += X_LIGHT_RANGES.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
  }
  return len;
}

// ---------- Media ----------
export async function resolveVideo(
  output: OutputRecord,
  ctx: PublishContext,
  videoOutputId: string | undefined,
): Promise<{ record: OutputRecord; video: Video } | { error: string }> {
  let record: OutputRecord | undefined;
  if (videoOutputId) {
    record = await ctx.getOutput(videoOutputId);
    if (!record) return { error: `video output ${videoOutputId} not found` };
  } else {
    for (const id of output.dependsOn ?? []) {
      const dep = await ctx.getOutput(id);
      if (dep?.kind === "video") {
        record = dep;
        break;
      }
    }
    if (!record) return { error: "no rendered video: set payload.videoOutputId (or depend on a video output)" };
  }
  if (record.kind !== "video") return { error: `output ${record.id} is a ${record.kind}, not a video` };
  const parsed = VideoPayload.safeParse(record.payload);
  if (!parsed.success) return { error: `video output ${record.id} has an invalid payload: ${zodMessage(parsed.error)}` };
  return { record, video: parsed.data };
}

export function contentTypeFor(path: string): string {
  const ext = extname(new URL(path, "file:///").pathname).toLowerCase();
  return (
    {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".vtt": "text/vtt",
      ".srt": "application/x-subrip",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}

/** Load bytes of a resolved asset (local absolute path, file:// URL or http(s) URL). */
export async function loadAsset(location: string, label: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(location)) {
    const res = await http({ url: location, label: `${label}.download`, responseType: "buffer", timeoutMs: 300_000 });
    return res.buffer ?? Buffer.from(res.text);
  }
  const path = location.startsWith("file://") ? fileURLToPath(location) : location;
  return readFile(path);
}

export function isHttpsUrl(s: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(s);
}

// ---------- Publications ----------
export function newPublication(
  output: OutputRecord,
  ctx: PublishContext,
  mode: "live" | "dry_run",
  fields: Partial<Publication> & Pick<Publication, "status">,
): Publication {
  return {
    id: `pub_${randomUUID()}`,
    storyId: output.storyId,
    outputId: output.id,
    channel: output.channel,
    ledgerVersion: output.ledgerVersion,
    mode,
    publishedAt: new Date().toISOString(),
    approvedBy: ctx.approvedBy,
    ...fields,
    response: fields.response ? redact(fields.response) : undefined,
  };
}

export function correctionNote(ctx: PublishContext, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const note = ctx.correctionNote?.trim() || "This post was updated after a fact in the underlying story was corrected.";
  return `Correction (${date}): ${note} Full record: ${ctx.storyUrl}`;
}

/** Append a correction note, trimming the original text if needed to stay under max. */
export function appendCorrection(text: string, note: string, max: number): string {
  const sep = "\n\n";
  const room = max - note.length - sep.length;
  const base = text.length > room ? text.slice(0, Math.max(0, room - 1)) + "…" : text;
  return `${base}${sep}${note}`;
}

export function zodMessage(err: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return err.issues.map((i) => `${i.path.map(String).join(".") || "payload"}: ${i.message}`).join("; ");
}

export function checkSchedule(scheduleAt: string | undefined, minLeadMs: number, maxLeadMs: number): string | undefined {
  if (!scheduleAt) return undefined;
  const t = Date.parse(scheduleAt);
  if (!Number.isFinite(t)) return `scheduleAt is not a valid ISO-8601 timestamp: ${scheduleAt}`;
  const lead = t - Date.now();
  if (lead < minLeadMs) return `scheduleAt must be at least ${Math.round(minLeadMs / 60000)} min in the future`;
  if (lead > maxLeadMs) return `scheduleAt must be within ${Math.round(maxLeadMs / 86400000)} days`;
  return undefined;
}

export function maskPhone(n: string): string {
  const d = n.replace(/\D/g, "");
  return d.length <= 4 ? "****" : `${"*".repeat(d.length - 4)}${d.slice(-4)}`;
}

export function log(event: string, fields: Record<string, unknown>): void {
  if (env("PUBLISHER_LOG") === "silent") return;
  console.log(JSON.stringify(redact({ severity: fields.error ? "WARNING" : "INFO", component: "publisher", event, ...fields })));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
