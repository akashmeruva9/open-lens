import { MODELS } from "@openlens/config";
import { Assessment, type Claim, type ContextItem, type LensLane, type SourceRecord } from "@openlens/schemas";
import { ENGLISH_DESK, PLAIN_ENGLISH } from "./desk.js";
import { generateStructured, type RunMeta } from "./gemini.js";
import { validateAssessment, type Violation } from "./validators.js";

const SYSTEM = `You are the Editorial Synthesis Agent of OpenLens, a neutral AI newsroom. People see one-sided news everywhere; OpenLens collects what every outlet reports, does its own research, and explains the whole picture fairly, then gives its own evidence-based view.
Use ONLY the provided claims, outlet framing and research context. Never invent facts, numbers, names or quotes.

Write:
1. headline: plain, specific, not clickbait. neutralSummary: 2 sentences a newcomer understands.
2. explainer (the heart of OpenLens):
   - whatHappened: the news in 2-4 short sentences.
   - background: the context a newcomer needs (history, how we got here, why it matters), from the research context and claims. 3-5 sentences.
   - perspectives: 2-4 sides. Each names WHO holds the view in plain words (a government, a party, a group of people, or outlets leaning left/right) and explains what they say and why, attributed ("Ukraine says...", "Critics argue..."). Present each side at its strongest and fairly, in similar length. If only one side is reported, say what the other side is likely to be missing or that its view was not reported; never invent a side's quote.
   - take: OpenLens's own view, clearly reasoned: what the evidence actually supports, which claims hold up and which don't, what is still unclear, and what a fair-minded reader should conclude. You may say a claim is weak, misleading or well-supported, citing the evidence. Weigh legitimate values on each side. Do not tell readers whom to vote for or which party to support. confidence: high only when the key facts are supported by independent sources; low when they are mostly unverified or contested.
   - whatsNext: what to watch for next.
3. sections (the evidence ledger): established (ONLY claims whose state is "supported"; if none, say nothing is independently established yet and cite the closest claims under "unknown" instead), attributed (who said what), contested (where sources disagree), unknown (what is missing), implications, would_change (what evidence would change this assessment).

Rules: every part lists the claimIds it relies on (only ids given to you; background may cite none). Never present attributed allegations or opinions as established fact. No numeric truth scores.
${ENGLISH_DESK}
${PLAIN_ENGLISH}`;

export async function synthesizeAssessment(
  storyId: string,
  claims: Claim[],
  sources: SourceRecord[],
  ledgerVersion = 1,
  extra: { lanes?: LensLane[]; context?: ContextItem[] } = {},
): Promise<{ assessment: Assessment; violations: Violation[]; meta: RunMeta }> {
  const ledger = claims
    .map(
      (c) =>
        `${c.id} [${c.claimType}/${c.state}] ${c.attributedTo ? `(${c.attributedTo}) ` : ""}${c.text} {source: ${c.evidence[0]?.sourceId}}`,
    )
    .join("\n");
  const srcList = sources.map((s) => `${s.id}: ${s.publisher} (${s.sourceType}, lean=${s.lens.rating})`).join("\n");
  const lanes = (extra.lanes ?? [])
    .map((l) => `[${l.lens}] ${l.summary} Emphasizes: ${l.emphasizes.join("; ")}. Does not establish: ${l.doesNotEstablish.join("; ")}`)
    .join("\n");
  const context = (extra.context ?? []).map((c) => `${c.id} [${c.kind}] ${c.title}: ${c.summary}`).join("\n");

  const { data, meta } = await generateStructured({
    model: MODELS.reasoning,
    system: SYSTEM,
    schema: Assessment,
    temperature: 0.3,
    prompt: `storyId: ${storyId}\nledgerVersion: ${ledgerVersion}\n\nSOURCES:\n${srcList}\n\nCLAIMS:\n${ledger}${lanes ? `\n\nHOW OUTLETS FRAMED IT (by documented lean):\n${lanes}` : ""}${context ? `\n\nRESEARCH CONTEXT:\n${context}` : ""}`,
  });
  // Explainer citations: keep only ids that exist (the ledger sections are validated below).
  const known = new Set(claims.map((c) => c.id));
  const keep = (ids: string[]) => ids.filter((id) => known.has(id));
  const ex = data.explainer;
  const explainer = ex && {
    ...ex,
    whatHappened: { ...ex.whatHappened, claimIds: keep(ex.whatHappened.claimIds) },
    background: { ...ex.background, claimIds: keep(ex.background.claimIds) },
    perspectives: ex.perspectives.map((p) => ({ ...p, claimIds: keep(p.claimIds) })),
    take: { ...ex.take, claimIds: keep(ex.take.claimIds) },
  };
  // "Established" may only cite supported claims. The model sometimes slips an attributed or
  // contested claim in; move those ids to an "attributed" section instead of shipping a false claim.
  const stateOf = new Map(claims.map((c) => [c.id, c.state]));
  const sections = data.sections.flatMap((s) => {
    if (s.kind !== "established") return [s];
    const ok = s.claimIds.filter((id) => stateOf.get(id) === "supported");
    const moved = s.claimIds.filter((id) => known.has(id) && stateOf.get(id) !== "supported");
    if (!moved.length) return [s];
    const out = [];
    if (ok.length) out.push({ ...s, claimIds: ok });
    out.push({ kind: "attributed" as const, text: "Reported, but not yet confirmed by independent sources.", claimIds: moved });
    return out;
  });
  const assessment = { ...data, sections, explainer, storyId, ledgerVersion };
  return { assessment, violations: validateAssessment(assessment, claims), meta };
}
