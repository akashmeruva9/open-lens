import type { Lead } from "./discovery.js";

/** A developing event: leads that look like the same story, possibly already promoted to a Story. */
export interface Candidate {
  id: string;
  market: string;
  title: string;
  centroid: number[] | null;
  tokens: string[];
  leadIds: string[];
  domains: string[];
  storyId?: string;
  createdAt: string;
  updatedAt: string;
  /** Lead ids already fed into the story pipeline. */
  processedLeadIds: string[];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Word (or CJK/Thai segment) tokens for the lexical fallback. */
export function tokens(text: string): string[] {
  const out = new Set<string>();
  for (const { segment, isWordLike } of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text.toLowerCase()))
    if (isWordLike && segment.length > 1 && !STOP.has(segment)) out.add(segment);
  return [...out];
}
const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "after", "over", "into", "says", "said", "will", "has", "have", "are", "was", "its", "new"]);

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

export interface ClusterOptions {
  /** Cosine similarity needed to join an existing candidate (embeddings). */
  threshold?: number;
  /** Jaccard needed when embeddings are unavailable. */
  lexicalThreshold?: number;
  /** Only join candidates updated within this window. */
  windowHours?: number;
  now?: Date;
}

/**
 * Assign leads to candidates (same market only). Returns the touched candidates.
 * `vectors[i]` is the embedding of leads[i], or null when embeddings failed.
 */
export function assignLeads(
  leads: Lead[],
  vectors: (number[] | null)[],
  candidates: Candidate[],
  opts: ClusterOptions = {},
): { candidates: Candidate[]; touched: Set<string> } {
  const threshold = opts.threshold ?? 0.8;
  const lexical = opts.lexicalThreshold ?? 0.35;
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - (opts.windowHours ?? 72) * 3600_000;
  const touched = new Set<string>();
  const all = [...candidates];

  leads.forEach((lead, i) => {
    const vec = vectors[i] ?? null;
    const tk = tokens(`${lead.title} ${lead.summary ?? ""}`);
    let best: { c: Candidate; score: number } | undefined;
    for (const c of all) {
      if (c.market !== lead.market || new Date(c.updatedAt).getTime() < cutoff || c.leadIds.includes(lead.id)) continue;
      const score = vec && c.centroid ? cosine(vec, c.centroid) : jaccard(tk, c.tokens);
      const need = vec && c.centroid ? threshold : lexical;
      if (score >= need && (!best || score > best.score)) best = { c, score };
    }
    const at = now.toISOString();
    if (best) {
      const c = best.c;
      const n = c.leadIds.length;
      if (vec && c.centroid) c.centroid = c.centroid.map((v, k) => (v * n + vec[k]!) / (n + 1));
      c.leadIds.push(lead.id);
      c.tokens = [...new Set([...c.tokens, ...tk])].slice(0, 200);
      if (!c.domains.includes(lead.domain)) c.domains.push(lead.domain);
      c.updatedAt = at;
      touched.add(c.id);
    } else {
      const c: Candidate = {
        id: `cand-${lead.id.slice(0, 12)}`, market: lead.market, title: lead.title, centroid: vec, tokens: tk,
        leadIds: [lead.id], domains: [lead.domain], createdAt: at, updatedAt: at, processedLeadIds: [],
      };
      all.push(c);
      touched.add(c.id);
    }
  });
  return { candidates: all, touched };
}
