// Hand-off contract for distribution: finished videos as plain RenderedAsset records.
import { RenderedAsset, VideoPayload, type OutputRecord } from "@openlens/schemas";
import type { StoryRecord } from "./store.js";

export function buildRenderedAssets(rec: Pick<StoryRecord, "outputs">): RenderedAsset[] {
  const byId = new Map(rec.outputs.map((o) => [o.id, o]));
  const out: RenderedAsset[] = [];
  for (const o of rec.outputs.filter((x: OutputRecord) => x.kind === "video")) {
    const v = VideoPayload.safeParse(o.payload);
    if (!v.success) continue;
    const script = byId.get(v.data.scriptOutputId);
    const sp = (script?.payload ?? {}) as { title?: string; presenter?: string };
    out.push(
      RenderedAsset.parse({
        storyId: o.storyId,
        ledgerVersion: o.ledgerVersion,
        lang: o.lang,
        tier: o.tier,
        aspect: v.data.aspect,
        mp4Url: v.data.mp4Url,
        hlsUrl: v.data.hlsUrl,
        captionsVttUrl: v.data.captionsVttUrl,
        thumbnailUrl: v.data.thumbnailUrl,
        durationSeconds: v.data.durationSeconds,
        claimIds: o.claimIds,
        title: sp.title ?? o.storyId,
        presenter: sp.presenter,
        aiDisclosure: true,
        status: o.status,
        videoOutputId: o.id,
      }),
    );
  }
  return out.sort((a, b) => a.lang.localeCompare(b.lang) || a.aspect.localeCompare(b.aspect));
}
