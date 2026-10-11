import Link from "next/link";
import type { FeedItem } from "@openlens/schemas";
import { EvidenceChip, Pill } from "@/components/ui/chips";
import { IconAlert, IconPlay, IconSources } from "@/components/ui/icons";
import { RelTime } from "@/components/ui/time";
import { regionName, titleCase } from "@/lib/format";
import { LensCoverage } from "./lens-coverage";

export function FeedCard({ item, lead = false }: { item: FeedItem; lead?: boolean }) {
  const headingId = `feed-${item.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="card group relative overflow-hidden p-4 transition hover:border-ink-3 sm:p-5"
    >
      {lead ? (
        <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,var(--lens-left),var(--lens-center),var(--lens-right))" }} />
      ) : null}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span className="font-semibold uppercase tracking-wider text-ink-2">{regionName(item.region)}</span>
        <span aria-hidden>·</span>
        <span>{item.topics.map(titleCase).join(" / ")}</span>
        {item.corrected ? (
          <Pill toneVar="--st-bad" className="ml-auto">
            <IconAlert size={12} /> Corrected
          </Pill>
        ) : null}
      </div>

      <h2 id={headingId} className={`font-serif font-semibold leading-tight tracking-tight text-ink ${lead ? "text-2xl sm:text-[28px]" : "text-xl"}`}>
        <Link href={`/story/${item.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
          {item.title}
        </Link>
      </h2>
      <p className={`mt-2 text-[15px] leading-relaxed text-ink-2 ${lead ? "line-clamp-4" : "line-clamp-3"}`}>{item.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {item.evidence.supported ? <EvidenceChip state="supported" count={item.evidence.supported} /> : null}
        {item.evidence.contested ? <EvidenceChip state="contested" count={item.evidence.contested} /> : null}
        {item.evidence.unverified ? <EvidenceChip state="unverified" count={item.evidence.unverified} /> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-ink-3">
        <RelTime iso={item.updatedAt} prefix="Updated " />
        <span className="inline-flex items-center gap-1">
          <IconSources size={13} /> {item.sourceCount} sources
        </span>
        <LensCoverage lenses={item.lensesCovered} />
        <span className="inline-flex items-center gap-1 uppercase tracking-wide">{item.languages.join(" · ")}</span>
        {item.videoUrl ? (
          <span className="relative z-10 ml-auto inline-flex items-center gap-1 font-medium text-ink-2">
            <IconPlay size={12} /> Video brief
          </span>
        ) : null}
      </div>
    </article>
  );
}
