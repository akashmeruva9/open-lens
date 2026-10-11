import { AI_DISCLOSURE, CHANNEL_LIMITS, LANGUAGES, MODELS, PUBLIC_WEB_URL, type LangCode } from "@openlens/config";
import {
  CarouselPayload, FbPostPayload, IgReelPayload, WaDigestPayload, XThreadPayload, YtMetaPayload,
  type Claim, type ScriptPayload, type SourceRecord, type Tier,
} from "@openlens/schemas";
import { z } from "zod";
import { generateStructured, type RunMeta } from "./gemini.js";

const SYSTEM = `You are the Channel Adapter Agent of a transparent newsroom. Adapt an APPROVED script into platform-native copy.
Rules: use only facts in the script; keep attribution and uncertainty ("not yet verified", "critics say"); no clickbait, no emojis beyond one per post, no hashtags spam.
Write in the requested language. Include the story link where a field asks for it.`;

const XDraft = z.object({ posts: z.array(z.string()).min(2).max(6) });
const YtDraft = z.object({ title: z.string(), descriptionBody: z.string(), tags: z.array(z.string()).max(12) });
const IgDraft = z.object({ caption: z.string(), hashtags: z.array(z.string()).max(6) });
const CarouselDraft = CarouselPayload.omit({ caption: true }).extend({ caption: z.string() });
const FbDraft = z.object({ message: z.string() });
const WaDraft = z.object({ headline: z.string().describe("max 60 chars"), oneLine: z.string().describe("max 160 chars") });

export interface ChannelPackage {
  yt: z.infer<typeof YtMetaPayload>;
  x: z.infer<typeof XThreadPayload>;
  ig: z.infer<typeof IgReelPayload>;
  carousel: z.infer<typeof CarouselPayload>;
  fb: z.infer<typeof FbPostPayload>;
  wa: z.infer<typeof WaDigestPayload>;
}

/** X counts URLs as 23 chars; approximate weighted length. */
export function xLength(s: string): number {
  return s.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

function fitThread(posts: string[], link: string): string[] {
  const max = CHANNEL_LIMITS.x.maxChars;
  const out = posts.map((p) => (xLength(p) <= max ? p : `${p.slice(0, max - 1)}…`));
  if (!out.some((p) => p.includes(link))) out.push(`Evidence, sources and what's still unknown: ${link}`);
  return out.slice(0, CHANNEL_LIMITS.x.maxThreadPosts);
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
  const metas: RunMeta[] = [];
  const call = async <S extends z.ZodType>(schema: S, task: string) => {
    const r = await generateStructured({ model: MODELS.fast, system: SYSTEM, schema, prompt: `${task}\n\n${base}`, temperature: 0.5 });
    metas.push(r.meta);
    return r.data as z.infer<S>;
  };

  const [x, yt, ig, car, fb, wa] = await Promise.all([
    call(XDraft, "Write an X thread (each post <= 260 characters). First post states what happened; last post links to the story."),
    call(YtDraft, `Write YouTube metadata for the ${tier} channel. Title <= 90 chars, factual. descriptionBody: 3-5 short paragraphs summarizing what is established vs. disputed vs. unknown.`),
    call(IgDraft, "Write an Instagram Reel caption (<= 1200 chars) ending with 'Full evidence: link in bio'."),
    call(CarouselDraft, "Write a 5-7 slide Instagram carousel: what happened, sources, where they disagree, evidence, unknowns. Each slide heading <= 40 chars, body <= 200 chars. Cite claimIds per slide using the ids that appear in the script lines' facts (use [] if unsure)."),
    call(FbDraft, "Write a Facebook Page post (<= 900 chars) with a neutral summary and an invitation to read the evidence."),
    call(WaDraft, "Write a WhatsApp digest: a short headline and one line summary."),
  ]);

  const known = new Set(claims.map((c) => c.id));
  const sourceList = sources.map((s) => `• ${s.publisher}: ${s.url}`).join("\n");
  const pkg: ChannelPackage = {
    x: XThreadPayload.parse({ posts: fitThread(x.posts, link) }),
    yt: YtMetaPayload.parse({
      tier,
      title: yt.title.slice(0, CHANNEL_LIMITS.youtube.titleMax),
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
      params: [wa.headline.slice(0, 60), wa.oneLine.slice(0, 160), link],
      previewText: `${wa.headline}\n${wa.oneLine}\n${link}`.slice(0, CHANNEL_LIMITS.whatsapp.templateBodyMax),
      link,
    }),
  };
  return { pkg, metas };
}
