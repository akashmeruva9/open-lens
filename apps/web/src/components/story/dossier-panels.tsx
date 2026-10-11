"use client";
import { LensChip, Tag } from "@/components/ui/chips";
import { IconExternal } from "@/components/ui/icons";
import { CONTEXT_KIND } from "@/lib/meta";
import { absoluteTime, hostname, titleCase } from "@/lib/format";
import { ClaimRefs } from "./claim-ref";
import { useStory } from "./story-context";

export function TimelinePanel() {
  const { bundle } = useStory();
  if (!bundle.timeline.length) return <Empty>No timeline yet.</Empty>;
  const ctxTitle = new Map(bundle.context.map((c) => [c.id, c.title]));
  return (
    <ol className="relative ml-2 space-y-5 border-l border-line pl-5">
      {bundle.timeline.map((t, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-bg bg-brand" />
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t.date}</p>
          <p className="mt-0.5 text-[15px] text-ink">
            {t.text} <ClaimRefs ids={t.claimIds} className="align-middle" />
          </p>
          {t.contextIds.length ? (
            <p className="mt-1 text-xs text-ink-3">Context: {t.contextIds.map((id) => ctxTitle.get(id) ?? id).join(", ")}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function ContextPanel() {
  const { bundle } = useStory();
  if (!bundle.context.length) return <Empty>No legal or official context collected yet.</Empty>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {bundle.context.map((c) => (
        <li key={c.id} className="card p-4">
          <Tag>{CONTEXT_KIND[c.kind] ?? titleCase(c.kind)}</Tag>
          <p className="mt-2 font-semibold text-ink">{c.title}</p>
          <p className="mt-1 text-sm text-ink-2">{c.summary}</p>
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
              {hostname(c.url)} <IconExternal size={12} />
            </a>
          ) : null}
          {c.groundingUrls.length ? (
            <p className="mt-2 text-xs text-ink-3">Grounded on {c.groundingUrls.length} web result(s)</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SourcesPanel() {
  const { bundle } = useStory();
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {bundle.sources.map((s) => (
        <li key={s.id} id={`source-${s.id}`} className="scroll-mt-24 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{s.publisher}</span>
            <LensChip lens={s.lens.rating} compact />
            <Tag>{titleCase(s.sourceType)}</Tag>
            <Tag>{s.language.toUpperCase()}</Tag>
          </div>
          <a href={s.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-start gap-1 text-[15px] text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
            {s.title} <IconExternal size={12} className="mt-1.5 shrink-0" />
          </a>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-ink-3 sm:grid-cols-2">
            <div><dt className="inline font-medium text-ink-2">Lens rating basis: </dt><dd className="inline">{s.lens.ratingBasis ?? "Not documented"}</dd></div>
            <div><dt className="inline font-medium text-ink-2">Published: </dt><dd className="inline">{absoluteTime(s.publishedAt)}</dd></div>
            <div><dt className="inline font-medium text-ink-2">Rights: </dt><dd className="inline">{s.rights.license} · {s.rights.usage}</dd></div>
            {s.derivedFrom ? <div><dt className="inline font-medium text-ink-2">Derived from: </dt><dd className="inline">{s.derivedFrom} (not independent)</dd></div> : null}
          </dl>
          {s.lens.modelFraming ? <p className="mt-2 text-xs italic text-ink-3">Model-generated framing note: {s.lens.modelFraming}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-3">{children}</p>;
}
