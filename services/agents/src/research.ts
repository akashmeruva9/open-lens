import { MODELS } from "@openlens/config";
import { ContextItem, TimelineEvent, type Claim, type SourceRecord } from "@openlens/schemas";
import { z } from "zod";
import { ENGLISH_DESK, PLAIN_ENGLISH } from "./desk.js";
import { generateStructured, type RunMeta } from "./gemini.js";

const ResearchOut = z.object({
  context: z.array(ContextItem.omit({ groundingUrls: true })).max(8),
  timeline: z.array(TimelineEvent).max(12),
});

const SYSTEM = `You are the Research Agent of a transparent newsroom.
Find background a reader needs: relevant laws/regulations, official orders, prior government or institutional actions, datasets, and comparable past cases.
Also build a chronological timeline of the event using the claims (cite claimIds) and any context you add (cite context ids).
Rules: prefer primary/official sources and include their URL when you have one. Never invent URLs, document names or dates. If unsure, omit.
${ENGLISH_DESK}
${PLAIN_ENGLISH}`;

export interface ResearchResult {
  context: ContextItem[];
  timeline: TimelineEvent[];
  grounded: boolean;
  meta: RunMeta;
}

/**
 * Uses Google Search grounding when available. If grounding is unavailable (e.g. no quota),
 * falls back to source-pack-only research and returns grounded=false so QA flags it.
 */
export async function research(storyTitle: string, claims: Claim[], sources: SourceRecord[]): Promise<ResearchResult> {
  const prompt = `STORY: ${storyTitle}\n\nSOURCES:\n${sources
    .map((s) => `${s.id} ${s.publisher} (${s.sourceType}, ${s.publishedAt}): ${s.title}`)
    .join("\n")}\n\nCLAIMS:\n${claims.map((c) => `${c.id} ${c.text}`).join("\n")}`;

  const useGrounding = process.env.RESEARCH_GROUNDING !== "0";
  if (useGrounding) {
    try {
      const { data, meta } = await generateStructured({
        model: MODELS.reasoning,
        system: SYSTEM,
        schema: ResearchOut,
        prompt,
        tools: [{ googleSearch: {} }],
      });
      const urls = meta.groundingUrls ?? [];
      return {
        context: data.context.map((c, i) => ({ ...c, id: c.id || `ctx${i + 1}`, groundingUrls: urls })),
        timeline: data.timeline,
        grounded: urls.length > 0,
        meta,
      };
    } catch (err) {
      if ((err as { status?: number }).status !== 429) throw err;
      // fall through to ungrounded mode
    }
  }
  const { data, meta } = await generateStructured({
    model: MODELS.reasoning,
    system: `${SYSTEM}\nSearch is unavailable: use ONLY the sources and claims given. Do not add outside facts; context may only describe what the sources themselves reference.`,
    schema: ResearchOut,
    prompt,
  });
  return {
    context: data.context.map((c, i) => ({ ...c, id: c.id || `ctx${i + 1}`, groundingUrls: [] })),
    timeline: data.timeline,
    grounded: false,
    meta,
  };
}
