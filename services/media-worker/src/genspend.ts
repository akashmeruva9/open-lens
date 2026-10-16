// Spend ledger + hard cap + content-hash cache helpers for paid generative calls (Veo, Nano Banana, Gemini review).
// Every paid call appends one JSON line to .data/genai-spend.jsonl with its estimated cost (Vertex list prices).
// A call is refused if it would push the ledger total above GENAI_SPEND_CAP_USD (default US$3).
import { createHash } from "node:crypto";
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const DATA_DIR = process.env.MEDIA_DATA_DIR || resolve(REPO_ROOT, ".data");
const LEDGER = () => resolve(DATA_DIR, "genai-spend.jsonl");
const CAP = () => Number(process.env.GENAI_SPEND_CAP_USD ?? 3);

/** Vertex AI list prices (USD), checked on the pricing page 2026-10-15. */
export const PRICE = {
  /** Veo 3.1 Fast, per second of output. */
  veoFastAudio720: 0.1,
  veoFastVideo720: 0.08,
  veoLiteAudio720: 0.05,
  veoLiteVideo720: 0.03,
  /** Nano Banana 2.1, 1K output image (1120 tokens at $30/M) + a short text prompt. */
  nanoBanana1K: 0.035,
} as const;

export interface SpendEntry { at: string; kind: string; model: string; usd: number; key?: string; note?: string; latencyS?: number }

export const sha = (...parts: (string | Buffer)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\u0000");
  return h.digest("hex").slice(0, 24);
};

export async function spentSoFar(): Promise<number> {
  const txt = await readFile(LEDGER(), "utf8").catch(() => "");
  return txt.split("\n").filter(Boolean).reduce((s, l) => s + (JSON.parse(l) as SpendEntry).usd, 0);
}

/** Throws if spending `usd` more would exceed the cap. Call before submitting a paid request. */
export async function assertBudget(usd: number, what: string): Promise<void> {
  const spent = await spentSoFar();
  if (spent + usd > CAP() + 1e-9)
    throw new Error(`budget cap: ${what} would cost ~US$${usd.toFixed(3)}; spent US$${spent.toFixed(3)} of US$${CAP()} (GENAI_SPEND_CAP_USD)`);
}

export async function logSpend(e: Omit<SpendEntry, "at">): Promise<void> {
  await mkdir(dirname(LEDGER()), { recursive: true });
  await appendFile(LEDGER(), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
  console.log(`[spend] ${e.kind} ${e.model} ~US$${e.usd.toFixed(3)} (total ~US$${(await spentSoFar()).toFixed(3)})`);
}

export const exists = (p: string) => access(p).then(() => true, () => false);
