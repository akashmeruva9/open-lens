import { intEnv } from "./env.js";

export interface HttpRequest {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  /** Serialised as JSON with content-type application/json. */
  json?: unknown;
  /** Serialised as application/x-www-form-urlencoded. */
  form?: Record<string, string>;
  /** Raw body (Buffer, string, FormData, ...). */
  body?: BodyInit | Uint8Array;
  /** Short name for errors/logs, e.g. "youtube.videos.insert". */
  label: string;
  timeoutMs?: number;
  /** Max retry attempts after the first try (default PUBLISHER_HTTP_RETRIES or 3). */
  retries?: number;
  /**
   * Retry 5xx / network errors / timeouts. Default true. Set false for non-idempotent creates
   * (posting a tweet, sending a WhatsApp message) where a retry could duplicate content.
   * 429 is always retried: the request was rejected before processing.
   */
  retry5xx?: boolean;
  responseType?: "json" | "buffer";
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  buffer?: Buffer;
  attempts: number;
}

export class HttpError extends Error {
  constructor(
    public readonly label: string,
    public readonly status: number | undefined,
    message: string,
    public readonly url: string,
    public readonly body?: unknown,
    public readonly attempts = 1,
  ) {
    super(`${label}: ${status ? `HTTP ${status} ` : ""}${message}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfter: string | null): number {
  const base = intEnv("PUBLISHER_RETRY_BASE_MS", 500);
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 30_000));
  }
  const exp = Math.min(base * 2 ** attempt, 8_000);
  return exp / 2 + Math.random() * (exp / 2);
}

/** Pull a human-readable message out of Google / Meta / X error bodies. */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, any>;
    if (b.error && typeof b.error === "object") {
      const e = b.error;
      const parts = [e.message, e.error_user_msg, e.code ? `code=${e.code}` : undefined, e.error_subcode ? `subcode=${e.error_subcode}` : undefined]
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    if (typeof b.error === "string") return [b.error, b.error_description].filter(Boolean).join(": ");
    if (b.detail || b.title) return [b.title, b.detail].filter(Boolean).join(": ");
    if (Array.isArray(b.errors) && b.errors.length) return b.errors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
  }
  return fallback;
}

export async function http(req: HttpRequest): Promise<HttpResponse> {
  const maxRetries = req.retries ?? intEnv("PUBLISHER_HTTP_RETRIES", 3);
  const retry5xx = req.retry5xx ?? true;
  const headers: Record<string, string> = { ...(req.headers ?? {}) };
  let body: BodyInit | undefined;
  if (req.json !== undefined) {
    body = JSON.stringify(req.json);
    headers["Content-Type"] ??= "application/json";
  } else if (req.form) {
    body = new URLSearchParams(req.form).toString();
    headers["Content-Type"] ??= "application/x-www-form-urlencoded";
  } else if (req.body !== undefined) {
    body = req.body as BodyInit;
  }

  let attempt = 0;
  for (;;) {
    attempt++;
    let res: Response;
    try {
      res = await globalThis.fetch(req.url, {
        method: req.method ?? "GET",
        headers,
        body,
        signal: AbortSignal.timeout(req.timeoutMs ?? intEnv("PUBLISHER_HTTP_TIMEOUT_MS", 30_000)),
      });
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (retry5xx && attempt <= maxRetries) {
        await sleep(backoffMs(attempt - 1, null));
        continue;
      }
      throw new HttpError(req.label, undefined, `network error (${msg})`, redactUrl(req.url), undefined, attempt);
    }

    if ((res.status === 429 || (retry5xx && res.status >= 500)) && attempt <= maxRetries) {
      // drain body to free the socket
      await res.arrayBuffer().catch(() => undefined);
      await sleep(backoffMs(attempt - 1, res.headers.get("retry-after")));
      continue;
    }

    let text = "";
    let buffer: Buffer | undefined;
    if (req.responseType === "buffer" && res.ok) {
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      text = await res.text();
    }
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    if (!res.ok) {
      const parsed = json ?? text.slice(0, 500);
      throw new HttpError(req.label, res.status, apiErrorMessage(parsed, res.statusText || "request failed"), redactUrl(req.url), redact(parsed), attempt);
    }
    return { status: res.status, headers: res.headers, text, json, buffer, attempts: attempt };
  }
}

// ---------------------------------------------------------------------------------------------
// Redaction: nothing that leaves this package (responses, errors, logs) may carry a credential.

const SECRET_KEY = /(token|secret|authorization|password|signature|appsecret|api[_-]?key|client_id)/i;

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (SECRET_KEY.test(k)) u.searchParams.set(k, "[REDACTED]");
    return u.toString();
  } catch {
    return url;
  }
}

export function redact<T>(value: T): T {
  return redactInner(value, 0) as T;
}

function redactInner(value: unknown, depth: number): unknown {
  if (depth > 12) return "[…]";
  if (typeof value === "string") {
    return value
      .replace(/(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]+/g, "$1 [REDACTED]")
      .replace(/([?&](?:access_token|token|key)=)[^&\s]+/gi, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redactInner(v, depth + 1));
  if (value && typeof value === "object") {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `<binary ${(value as Uint8Array).byteLength} bytes>`;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && v !== undefined && v !== null && typeof v !== "object" ? "[REDACTED]" : redactInner(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function formatError(err: unknown): string {
  if (err instanceof HttpError) return redact(err.message) + (err.attempts > 1 ? ` (after ${err.attempts} attempts)` : "");
  if (err instanceof Error) return redact(err.message);
  return redact(String(err));
}
