import {
  AI_DISCLOSURE, CHANNEL_LIMITS, CHANNEL_PLAN, LANGUAGES, MODELS, PUBLIC_WEB_URL, xTruncate, xWeightedLength, type LangCode,
} from "@openlens/config";
import {
  CarouselPayload, FbPostPayload, IgReelPayload, WaDigestPayload, XThreadPayload, YtMetaPayload,
  type Claim, type ScriptPayload, type SourceRecord, type Tier,
} from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";

const SYSTEM = `You are the Channel Adapter Agent of a transparent newsroom. Adapt an APPROVED script into platform-native copy.
Rules: use only facts in the script; keep attribution and uncertainty ("not yet verified", "critics say"); no clickbait, no emojis beyond one per post, no hashtags spam.
Write in the requested language. Include the story link where a field asks for it.`;

const Draft = z.object({
  x: z.object({ posts: z.array(z.string()).min(2).max(6).describe("X thread; each post <= 140 CJK/Thai characters or <= 260 Latin characters; first post states what happened") }),
  youtube: z.object({
    title: z.string().describe("<= 90 characters, factual, in the target language"),
    descriptionBody: z.string().describe("3-5 short paragraphs: established vs disputed vs unknown"),
    tags: z.array(z.string()).max(12),
  }),
  instagram: z.object({ caption: z.string().describe("Reel caption <= 1200 chars ending with a 'full evidence: link in bio' line in the target language"), hashtags: z.array(z.string()).max(6) }),
  carousel: z.object({
    slides: z.array(z.object({ heading: z.string().describe("<= 40 chars"), body: z.string().describe("<= 200 chars"), claimIds: z.array(z.string()) })).min(5).max(7)
      .describe("what happened, sources, where they disagree, evidence, unknowns"),
    caption: z.string(),
  }),
  facebook: z.object({ message: z.string().describe("<= 900 chars neutral summary inviting readers to the evidence") }),
  whatsapp: z.object({ headline: z.string().describe("<= 60 chars"), oneLine: z.string().describe("<= 160 chars") }),
});

export interface ChannelPackage {
  yt: z.infer<typeof YtMetaPayload>;
  x: z.infer<typeof XThreadPayload>;
  ig: z.infer<typeof IgReelPayload>;
  carousel: z.infer<typeof CarouselPayload>;
  fb: z.infer<typeof FbPostPayload>;
  wa: z.infer<typeof WaDigestPayload>;
}

/** X weighted length (URLs 23, CJK/Thai 2). */
export const xLength = xWeightedLength;

const X_DISCLOSURE = "AI-assisted summary, reviewed by OpenLens editors.";

function fitThread(posts: string[], link: string): string[] {
  const max = CHANNEL_LIMITS.x.maxChars;
  const out = posts
    .map((p) => xTruncate(p, max))
    .slice(0, CHANNEL_LIMITS.x.maxThreadPosts - 1);
  // Closing post always carries the evidence link and the AI disclosure.
  const closing = `Evidence, sources and what's still unknown: ${link}\n${X_DISCLOSURE}`;
  return [...out.filter((p) => !p.includes(link)), closing];
}

export async function buildChannelPackage(
  storyId: string,
  script: ScriptPayload,
  lang: LangCode,
  tier: Tier,
  sources: SourceRecord[],
  claims: Claim[],
): Promise<{ pkg: ChannelPackage; metas: RunMeta[] }> {
  const link = `${PUBLIC_WEB_URL}/story/${storyId}`;
  const langName = LANGUAGES[lang].name;
  const disclosure = AI_DISCLOSURE[lang] ?? AI_DISCLOSURE.en!;
  const base = `LANGUAGE: ${langName}\nSTORY LINK: ${link}\nSCRIPT:\n${script.lines.map((l) => `[${l.label}] ${l.text}`).join("\n")}`;
  const r = await generateStructured({
    model: MODELS.fast,
    system: SYSTEM,
    schema: Draft,
    temperature: 0.5,
    prompt: `Produce every platform package below for the ${tier} OpenLens channel "${CHANNEL_PLAN[lang]?.channel ?? "OpenLens"}". All text in ${langName}. In carousel slides cite claimIds from the script only (use [] if unsure).\n\n${base}`,
  });
  const metas: RunMeta[] = [r.meta];
  const { x, youtube: yt, instagram: ig, carousel: car, facebook: fb, whatsapp: wa } = r.data;

  const known = new Set(claims.map((c) => c.id));
  const sourceList = sources.map((s) => `• ${s.publisher}: ${s.url}`).join("\n");
  const pkg: ChannelPackage = {
    x: XThreadPayload.parse({ posts: fitThread(x.posts, link) }),
    yt: YtMetaPayload.parse({
      tier,
      title: [...yt.title].slice(0, CHANNEL_LIMITS.youtube.titleMax).join(""),
      description: `${yt.descriptionBody}\n\nRead the evidence: ${link}\n\nSources:\n${sourceList}\n\n${disclosure}`.slice(0, CHANNEL_LIMITS.youtube.descriptionMax),
      tags: yt.tags,
      containsSyntheticMedia: true,
    }),
    ig: IgReelPayload.parse({ caption: `${ig.caption}\n\n${disclosure}`.slice(0, CHANNEL_LIMITS.instagram.captionMax), hashtags: ig.hashtags }),
    carousel: CarouselPayload.parse({
      slides: car.slides.map((s) => ({ ...s, claimIds: s.claimIds.filter((id) => known.has(id)) })),
      caption: `${car.caption}\n\n${disclosure}`.slice(0, CHANNEL_LIMITS.instagram.captionMax),
    }),
    fb: FbPostPayload.parse({ message: `${fb.message}\n\n${disclosure}`, link }),
    wa: WaDigestPayload.parse({
      templateName: `openlens_digest_${lang}`,
      params: [[...wa.headline].slice(0, 60).join(""), [...wa.oneLine].slice(0, 160).join(""), link],
      previewText: `${wa.headline}\n${wa.oneLine}\n${link}`.slice(0, CHANNEL_LIMITS.whatsapp.templateBodyMax),
      link,
    }),
  };
  return { pkg, metas };
}

export const _fitThread = fitThread;
