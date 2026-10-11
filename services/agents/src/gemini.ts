import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

let client: GoogleGenAI | undefined;

export function getClient(): GoogleGenAI {
  if (client) return client;
  if (process.env.GEMINI_API_KEY) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else if (process.env.GOOGLE_CLOUD_PROJECT) {
    // Vertex AI with Application Default Credentials (Cloud Run)
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
    });
  } else {
    throw new Error("Set GEMINI_API_KEY (local) or GOOGLE_CLOUD_PROJECT (Vertex AI).");
  }
  return client;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry transient Gemini errors with exponential backoff, then fall back to the next model.
 * Fallback chain is configured via MODEL_FALLBACK (comma-separated).
 */
async function withResilience<T>(model: string, call: (model: string) => Promise<T>): Promise<T> {
  const chain = [model, ...(process.env.MODEL_FALLBACK ?? "").split(",").map((m) => m.trim()).filter(Boolean)];
  let lastErr: unknown;
  for (const m of chain) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await call(m);
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number }).status;
        if (!status || !RETRYABLE.has(status)) throw err;
        // 429 on a model usually means no quota: skip straight to the fallback.
        if (status === 429 && attempt > 0) break;
        // 503 = model overloaded: back off briefly, then move down the fallback chain.
        await sleep(1500 * 2 ** attempt + Math.random() * 1000);
      }
    }
  }
  // Whole chain overloaded: one long pause, then a final pass on the primary model.
  if ((lastErr as { status?: number }).status === 503) {
    await sleep(20000);
    return call(model);
  }
  throw lastErr;
}

export interface RunMeta {
  model: string;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
  /** Web sources Gemini used when Search grounding was enabled. */
  groundingUrls?: string[];
  cached?: boolean;
}

// Dev-only response cache keyed by prompt hash (set GEMINI_CACHE_DIR). Saves quota while iterating.
const CACHE_DIR = process.env.GEMINI_CACHE_DIR;
async function cacheGet(key: string): Promise<{ text: string; meta: RunMeta } | undefined> {
  if (!CACHE_DIR) return undefined;
  try {
    return JSON.parse(await readFile(join(CACHE_DIR, `${key}.json`), "utf8"));
  } catch {
    return undefined;
  }
}
async function cachePut(key: string, value: { text: string; meta: RunMeta }) {
  if (!CACHE_DIR) return;
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, `${key}.json`), JSON.stringify(value));
}

export interface StructuredResult<T> {
  data: T;
  meta: RunMeta;
}

/**
 * Call Gemini with a Zod schema as the response schema and validate the result.
 * Retries once with the validation error appended if the output does not parse.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  model: string;
  system: string;
  prompt: string;
  schema: S;
  temperature?: number;
  /** e.g. [{ googleSearch: {} }] for Search grounding */
  tools?: Record<string, unknown>[];
}): Promise<StructuredResult<z.infer<S>>> {
  const ai = getClient();
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });
  let prompt = opts.prompt;
  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const key = createHash("sha256")
      .update(JSON.stringify([opts.model, opts.system, prompt, jsonSchema, opts.tools ?? null, opts.temperature ?? 0.2]))
      .digest("hex");
    const hit = await cacheGet(key);
    let text: string;
    let meta: RunMeta;
    if (hit) {
      ({ text, meta } = hit);
      meta = { ...meta, cached: true };
    } else {
      const t0 = Date.now();
      const res = await withResilience(opts.model, (model) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: opts.system,
            temperature: opts.temperature ?? 0.2,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            ...(opts.tools ? { tools: opts.tools } : {}),
          },
        }),
      );
      text = res.text ?? "";
      const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      meta = {
        model: res.modelVersion ?? opts.model,
        latencyMs: Date.now() - t0,
        promptTokens: res.usageMetadata?.promptTokenCount,
        outputTokens: res.usageMetadata?.candidatesTokenCount,
        groundingUrls: chunks.map((c) => c.web?.uri).filter((u): u is string => Boolean(u)),
      };
    }
    try {
      const data = opts.schema.parse(JSON.parse(text));
      if (!hit) await cachePut(key, { text, meta });
      return { data, meta };
    } catch (err) {
      lastErr = err;
      prompt = `${opts.prompt}\n\nYour previous reply failed validation: ${String(err).slice(0, 800)}\nReturn corrected JSON only.`;
    }
  }
  throw new Error(`Structured output failed validation after retry: ${String(lastErr)}`);
}
