// Pure helpers that derive read models from a StoryBundle. Used by fixture mode and by UI.
import type { AgentRun, EvalReport, FeedItem, OutputRecord, QaFlag, ScriptPayload, StoryBundle } from "@openlens/schemas";

export function feedItemFromBundle(b: StoryBundle): FeedItem {
  const count = (s: string) => b.claims.filter((c) => c.state === s).length;
  const video = b.outputs.find((o) => o.kind === "video" && o.lang === "en") ?? b.outputs.find((o) => o.kind === "video");
  return {
    id: b.story.id,
    title: b.assessment?.headline || b.story.title,
    summary: b.assessment?.neutralSummary || b.story.summary,
    region: b.story.region,
    topics: b.story.topics,
    languages: b.story.languages,
    status: b.story.status,
    updatedAt: b.story.updatedAt,
    sourceCount: b.sources.length,
    lensesCovered: b.lanes.map((l) => l.lens),
    evidence: { supported: count("supported"), contested: count("contested"), unverified: count("unverified") },
    heroImage: b.story.heroImage,
    videoUrl: typeof video?.payload.mp4Url === "string" ? video.payload.mp4Url : undefined,
    corrected: b.corrections.length > 0,
  };
}

/**
 * Outputs affected by a change to `claimIds`: direct citations, then anything that
 * transitively dependsOn an affected output (script -> video -> yt_meta ...).
 */
export function impactedOutputIds(outputs: OutputRecord[], claimIds: string[]): string[] {
  const hit = new Set(outputs.filter((o) => o.claimIds.some((c) => claimIds.includes(c))).map((o) => o.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of outputs) {
      if (!hit.has(o.id) && o.dependsOn.some((d) => hit.has(d))) {
        hit.add(o.id);
        grew = true;
      }
    }
  }
  return outputs.filter((o) => hit.has(o.id)).map((o) => o.id);
}

const NUM_RE = /\d+(?:[.,]\d+)?/g;

/** Deterministic eval report computed from the bundle (fixture mode stand-in for /evals). */
export function computeEvals(b: StoryBundle, runs: AgentRun[]): EvalReport {
  const claimIds = new Set(b.claims.map((c) => c.id));
  const sections = b.assessment?.sections ?? [];
  const scriptLines = b.outputs
    .filter((o) => o.kind === "script")
    .flatMap((o) => (o.payload as unknown as ScriptPayload).lines ?? []);
  const units = [...sections.map((s) => s.claimIds), ...scriptLines.map((l) => l.claimIds)];
  const cited = units.filter((ids) => ids.some((id) => claimIds.has(id))).length;

  const stateCounts: Record<string, number> = {};
  for (const c of b.claims) stateCounts[c.state] = (stateCounts[c.state] ?? 0) + 1;

  const established = sections.find((s) => s.kind === "established");
  const unsupportedEstablished = (established?.claimIds ?? []).filter(
    (id) => b.claims.find((c) => c.id === id)?.state !== "supported",
  ).length;

  const backTranslation: Record<string, number> = {};
  for (const o of b.outputs.filter((o) => o.kind === "script")) {
    const bt = (o.payload as unknown as ScriptPayload).backTranslation;
    backTranslation[o.lang] = bt?.score ?? (o.lang === "en" ? 1 : 0.9);
  }

  // Number check: every number in an English script line must appear in a cited claim.
  let numberMismatches = 0;
  for (const o of b.outputs.filter((o) => o.kind === "script" && o.lang === "en")) {
    for (const l of (o.payload as unknown as ScriptPayload).lines ?? []) {
      const ledgerText = l.claimIds.map((id) => b.claims.find((c) => c.id === id)?.text ?? "").join(" ");
      for (const n of l.text.match(NUM_RE) ?? []) if (!ledgerText.includes(n)) numberMismatches++;
    }
  }

  const qaFlags: QaFlag[] = [];
  for (const o of b.outputs) {
    if (o.status === "needs_review")
      qaFlags.push({ severity: "warn", kind: "stale_output", detail: o.staleReason ?? "Ledger changed since generation", target: `output:${o.id}` });
  }
  for (const c of b.claims.filter((c) => c.state === "unverified"))
    qaFlags.push({ severity: "info", kind: "single_source", detail: `"${c.text}" has no independent corroboration`, target: `claim:${c.id}` });
  if (unsupportedEstablished > 0)
    qaFlags.push({ severity: "block", kind: "unsupported_established", detail: `${unsupportedEstablished} claim(s) in "established" are not supported`, target: "assessment:established" });

  const totalTokens = runs.reduce((s, r) => s + (r.promptTokens ?? 0) + (r.outputTokens ?? 0), 0);
  const totalLatencyMs = runs.reduce((s, r) => s + r.latencyMs, 0);
  return {
    storyId: b.story.id,
    ledgerVersion: b.story.version,
    citationCoverage: units.length ? cited / units.length : 1,
    claimsTotal: b.claims.length,
    claimsDroppedUnquoted: 0,
    stateCounts,
    unsupportedEstablished,
    backTranslation,
    numberMismatches,
    qaFlags,
    totalTokens,
    totalLatencyMs,
    // Rough flash-class pricing for display only.
    estCostUsd: Math.round(totalTokens * 0.0000004 * 10000) / 10000,
  };
}

const STAGES: [string, string, number, number, number][] = [
  ["intake", "fetch+readability", 1840, 0, 0],
  ["cluster", "gemini-embedding-2", 620, 2400, 0],
  ["claims", "gemini-3.8-flash", 5210, 6100, 1900],
  ["research", "gemini-3.8-flash", 9420, 4800, 2600],
  ["corroborate", "gemini-3.8-flash", 6110, 5200, 1400],
  ["lens", "gemini-3.8-flash", 4380, 3900, 1100],
  ["synthesize", "gemini-3.8-flash", 7920, 7400, 2200],
  ["qa", "gemini-3.8-flash", 3640, 6800, 700],
  ["localize", "gemini-3.8-flash", 8150, 5600, 4300],
  ["social", "gemini-3.8-flash", 4020, 3300, 1800],
  ["tts", "gemini-3.8-flash-tts", 11800, 900, 0],
  ["render", "ffmpeg", 22400, 0, 0],
];

/** Plausible fixture agent runs so the studio runs table is demoable without the API. */
export function fixtureRuns(storyId: string, at: string): AgentRun[] {
  const t0 = new Date(at).getTime() - STAGES.reduce((s, x) => s + x[2], 0);
  let t = t0;
  return STAGES.map(([stage, model, latencyMs, promptTokens, outputTokens], i) => {
    t += latencyMs;
    return {
      id: `${storyId}-run-${i + 1}`,
      storyId,
      stage,
      model,
      latencyMs,
      promptTokens: promptTokens || undefined,
      outputTokens: outputTokens || undefined,
      ok: true,
      at: new Date(t).toISOString(),
    };
  });
}

export const PIPELINE_STAGES = STAGES.map((s) => s[0]);

/** Pipeline progress (0..1) implied by a story status when no live SSE is available. */
export function statusProgress(status: string): number {
  switch (status) {
    case "draft": return 0;
    case "researching": return 0.45;
    case "in_review": return 0.8;
    case "approved": return 0.92;
    default: return 1;
  }
}
