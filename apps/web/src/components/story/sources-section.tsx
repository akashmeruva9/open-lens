"use client";
import { LensChip, Tag } from "@/components/ui/chips";
import { IconExternal } from "@/components/ui/icons";
import { hostname, titleCase } from "@/lib/format";
import { useStory } from "./story-context";

/** "Sources": every outlet and document the ledger quotes, with its lens rating and a jump into the dossier. */
export function SourcesSection() {
  const { bundle, focusSource } = useStory();
  if (!bundle.sources.length) return null;
  return (
    <section id="sources" aria-labelledby="sources-title" className="mt-16 scroll-mt-24">
      <h2 id="sources-title" className="display text-[24px] leading-[28px]">Sources</h2>
      <p className="mt-1 text-sm text-ink-3">{bundle.sources.length} sources quoted in the ledger. Lens ratings come from a documented outlet table.</p>
      <ol className="mt-5 divide-y divide-line border-y border-line">
        {bundle.sources.map((s, i) => (
          <li key={s.id} className="flex items-start gap-4 py-4">
            <span className="display w-6 shrink-0 pt-0.5 text-[15px] tabular-nums text-ink-3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-ink">{s.publisher}</span>
                <LensChip lens={s.lens.rating} compact />
                <Tag>{titleCase(s.sourceType)}</Tag>
              </div>
              <a href={s.url} target="_blank" rel="noreferrer noopener"
                className="mt-1 inline-flex items-start gap-1 text-[15px] leading-[22px] text-ink-2 underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink">
                {s.title} <IconExternal size={12} className="mt-1.5 shrink-0" />
              </a>
              <p className="mt-0.5 text-xs text-ink-3">{hostname(s.url)}</p>
            </div>
            <button type="button" onClick={() => focusSource(s.id)} className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-accent hover:underline">
              Details
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
