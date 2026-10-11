import { createHmac, timingSafeEqual } from "node:crypto";
import { CHANNEL_LIMITS } from "@openlens/config";
import { WaDigestPayload, type OutputRecord, type Publication } from "@openlens/schemas";
import { z } from "zod";
import { definePublisher, manualFollowUp } from "../base.js";
import { env, graphVersion, intEnv, jsonEnv, statusFromMissing } from "../env.js";
import { formatError } from "../http.js";
import { PublishError } from "../types.js";
import { hasAiDisclosure, isHttpsUrl, maskPhone, sleep, zodMessage } from "../util.js";
import { graph } from "./meta.js";

const L = CHANNEL_LIMITS.whatsapp;
const TOKEN = "WA_ACCESS_TOKEN";
const status = () => statusFromMissing(["WA_PHONE_NUMBER_ID", TOKEN]);

/** WA_TEMPLATES: per-template config mirroring what was approved in WhatsApp Manager. */
const TemplateConfig = z.object({
  /** Number of {{n}} placeholders in the approved body. */
  bodyParams: z.number().int().min(0),
  /** Template language code as approved (e.g. "en_US", "te"). Defaults to output.lang. */
  language: z.string().optional(),
  /** Template has a dynamic URL button; its {{1}} gets payload.link minus urlPrefix. */
  urlButton: z.boolean().optional(),
  urlPrefix: z.string().optional(),
  /** The approved body already contains a fixed AI disclosure line. */
  disclosureInTemplate: z.boolean().optional(),
});
type TemplateConfig = z.infer<typeof TemplateConfig>;

function templateConfig(name: string): TemplateConfig | undefined {
  const all = jsonEnv<Record<string, unknown>>("WA_TEMPLATES");
  const parsed = TemplateConfig.safeParse(all?.[name]);
  return parsed.success ? parsed.data : undefined;
}

type WaPayload = z.infer<typeof WaDigestPayload>;

function templateMessage(p: WaPayload, lang: string, cfg: TemplateConfig | undefined, to: string) {
  const components: Record<string, unknown>[] = [];
  if (p.params.length) components.push({ type: "body", parameters: p.params.map((text) => ({ type: "text", text })) });
  if (cfg?.urlButton) {
    const suffix = cfg.urlPrefix && p.link.startsWith(cfg.urlPrefix) ? p.link.slice(cfg.urlPrefix.length) : p.link;
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: suffix }] });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: p.templateName, language: { code: cfg?.language ?? lang }, ...(components.length ? { components } : {}) },
  };
}

function normalizeRecipients(list: string[] | undefined): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const raw of list ?? []) {
    const d = raw.replace(/[\s()+-]/g, "");
    if (/^\d{8,15}$/.test(d)) valid.add(d);
    else invalid.push(maskPhone(raw));
  }
  return { valid: [...valid], invalid };
}

interface WaState {
  payload: WaPayload;
  lang: string;
  cfg?: TemplateConfig;
  recipients: string[];
}

const messagesPath = () => `/${env("WA_PHONE_NUMBER_ID") ?? "{WA_PHONE_NUMBER_ID}"}/messages`;

export const whatsappPublisher = definePublisher<WaState>({
  channel: "whatsapp",
  kinds: ["wa_digest"],
  status,

  async validate(output, ctx, opts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const p = WaDigestPayload.safeParse(output.payload);
    if (!p.success) return { errors: [`invalid wa_digest payload: ${zodMessage(p.error)}`], warnings };
    const { params, previewText, link, templateName } = p.data;
    if (opts?.scheduleAt) errors.push("WhatsApp has no native scheduling; schedule the publish job instead");
    params.forEach((t, i) => {
      if (!t.trim()) errors.push(`template param ${i + 1} is empty`);
      if (/[\n\t]/.test(t)) errors.push(`template param ${i + 1} contains a newline/tab (rejected by WhatsApp)`);
      if (/ {5,}/.test(t)) errors.push(`template param ${i + 1} has more than 4 consecutive spaces`);
    });
    const total = params.reduce((n, t) => n + t.length, 0);
    if (total > L.templateBodyMax) errors.push(`template params total ${total} chars (body max ${L.templateBodyMax})`);
    if (previewText.length > L.templateBodyMax) errors.push(`previewText is ${previewText.length} chars (max ${L.templateBodyMax})`);
    if (!isHttpsUrl(link)) errors.push(`link must be an https URL (got "${link}")`);
    if (!link.includes(ctx.storyUrl) && !params.some((t) => t.includes(ctx.storyUrl))) errors.push(`digest must link to the story (${ctx.storyUrl})`);

    const cfg = templateConfig(templateName);
    if (!cfg) warnings.push(`template "${templateName}" not described in WA_TEMPLATES; parameter count can't be checked against the approved template`);
    else {
      if (cfg.bodyParams !== params.length) errors.push(`template "${templateName}" expects ${cfg.bodyParams} body params, got ${params.length}`);
      if (!cfg.urlButton && !params.some((t) => t.includes(link))) warnings.push("template has no URL button and no param carries the link; recipients won't get the story link");
    }
    if (output.aiDisclosure && !cfg?.disclosureInTemplate && !hasAiDisclosure([previewText, ...params].join("\n"))) {
      warnings.push("no AI disclosure in params; make sure the approved template body carries one (set disclosureInTemplate in WA_TEMPLATES)");
    }
    if (opts) {
      const { valid, invalid } = normalizeRecipients(opts.recipients);
      if (invalid.length) errors.push(`invalid recipient numbers (E.164 digits expected): ${invalid.join(", ")}`);
      if (opts.mode === "live" && valid.length === 0) errors.push("live WhatsApp send needs opts.recipients (opted-in subscribers only)");
      const max = intEnv("WA_MAX_RECIPIENTS", 1000);
      if (valid.length > max) errors.push(`${valid.length} recipients exceeds WA_MAX_RECIPIENTS=${max}`);
    }
    return { errors, warnings };
  },

  async prepare(output, _ctx, opts) {
    const payload = WaDigestPayload.parse(output.payload);
    const cfg = templateConfig(payload.templateName);
    const { valid } = normalizeRecipients(opts.recipients);
    const example = templateMessage(payload, output.lang, cfg, valid[0] ? maskPhone(valid[0]) : "{{recipient}}");
    return {
      requests: [
        {
          step: `messages (template) x ${valid.length} recipient(s)`,
          method: "POST",
          url: `graph.facebook.com/${graphVersion()}${messagesPath()}`,
          auth: `Bearer ${TOKEN}`,
          body: example,
        },
      ],
      warnings: valid.length ? [] : ["no recipients supplied; showing the request for a placeholder recipient"],
      state: { payload, lang: output.lang, cfg, recipients: valid },
    };
  },

  async execute(prep) {
    const { payload, lang, cfg, recipients } = prep.state;
    const interval = intEnv("WA_SEND_INTERVAL_MS", 100);
    const results: { to: string; messageId?: string; error?: string }[] = [];
    for (const [i, to] of recipients.entries()) {
      if (i > 0 && interval > 0) await sleep(interval);
      try {
        // No 5xx retry: a duplicate digest to a subscriber is worse than a missed one.
        const res = await graph(TOKEN, "POST", messagesPath(), "whatsapp.messages", { json: templateMessage(payload, lang, cfg, to), retry5xx: false });
        results.push({ to: maskPhone(to), messageId: res.json?.messages?.[0]?.id });
      } catch (err) {
        results.push({ to: maskPhone(to), error: formatError(err) });
      }
    }
    const sent = results.filter((r) => r.messageId);
    const failed = results.length - sent.length;
    if (sent.length === 0) {
      return { status: "failed", error: `all ${results.length} WhatsApp sends failed: ${results[0]?.error ?? "unknown"}`, response: { results } };
    }
    return {
      externalId: sent[0]!.messageId,
      response: { sent: sent.length, failed, results },
      ...(failed ? { error: `${failed}/${results.length} WhatsApp sends failed` } : {}),
    };
  },

  async update(pub: Publication, _output: OutputRecord) {
    if (pub.mode === "dry_run") return { ...pub, status: "corrected" };
    return manualFollowUp(pub, "update", "WhatsApp messages can't be edited; publish a correction digest (new wa_digest output) to the same subscribers");
  },

  async retract(pub: Publication) {
    if (pub.mode === "dry_run") return { ...pub, status: "retracted" };
    return manualFollowUp(pub, "retract", "WhatsApp Cloud API can't recall delivered business messages; send a correction digest instead");
  },
});

/**
 * Webhook verification handshake (GET). Mount in the api, e.g.
 * `const r = verifyWhatsAppWebhook(req.query); res.status(r.status).send(r.body)`.
 */
export function verifyWhatsAppWebhook(query: Record<string, unknown>): { status: number; body: string } {
  const one = (k: string) => {
    const v = query[k];
    return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined;
  };
  const expected = env("WA_WEBHOOK_VERIFY_TOKEN");
  const mode = one("hub.mode");
  const token = one("hub.verify_token");
  const challenge = one("hub.challenge");
  if (!expected) return { status: 503, body: "webhook not configured" };
  if (mode !== "subscribe" || !token || challenge === undefined) return { status: 400, body: "bad request" };
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 403, body: "forbidden" };
  return { status: 200, body: challenge };
}

/** Verify the X-Hub-Signature-256 header of a webhook POST against META_APP_SECRET. */
export function verifyMetaSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
  const secret = env("META_APP_SECRET");
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const got = Buffer.from(signatureHeader);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
