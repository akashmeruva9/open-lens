"use client";
// The OpenLens explainer: what happened, background, what each side says, and OpenLens's own take.
import type { Explainer } from "@openlens/schemas";
import { IconSparkle } from "@/components/ui/icons";
import { ClaimRefs } from "./claim-ref";

const CONFIDENCE: Record<Explainer["take"]["confidence"], { label: string; help: string }> = {
  high: { label: "High confidence", help: "The key facts are confirmed by independent sources." },
  medium: { label: "Medium confidence", help: "Some key facts are confirmed; others rest on one side's account." },
  low: { label: "Low confidence", help: "Most key points are not yet independently confirmed." },
};

function Block({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-24 first:mt-0">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`} className="display mt-1 text-[24px] leading-[28px]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ExplainerView({ explainer: e }: { explainer: Explainer }) {
  const conf = CONFIDENCE[e.take.confidence];
  return (
    <div className="mt-14">
      <Block id="what-happened" eyebrow="The story" title="What happened">
        <p className="text-[17px] leading-[27px] text-ink">
          {e.whatHappened.text} <ClaimRefs ids={e.whatHappened.claimIds} className="ml-0.5 align-middle" />
        </p>
      </Block>

      <Block id="background" eyebrow="Context" title="The background">
        <p className="text-[17px] leading-[27px] text-ink-2">
          {e.background.text} <ClaimRefs ids={e.background.claimIds} className="ml-0.5 align-middle" />
        </p>
      </Block>

      <Block id="sides" eyebrow="Perspectives" title="What each side says">
        <div className="grid gap-3 sm:grid-cols-2">
          {e.perspectives.map((p, i) => (
            <article key={i} className="rounded-lg bg-surface p-4">
              <h3 className="display text-[16px] text-ink">{p.side}</h3>
              <p className="mt-1.5 text-[15px] leading-[23px] text-ink-2">
                {p.view} <ClaimRefs ids={p.claimIds} className="ml-0.5 align-middle" />
              </p>
            </article>
          ))}
        </div>
      </Block>

      <Block id="take" eyebrow="OpenLens view" title="What we think">
        <div className="rounded-lg border-2 border-accent p-5">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-3">
            <span className="inline-flex items-center gap-1 text-accent"><IconSparkle size={12} /> AI analysis</span>
            <span aria-hidden>·</span>
            <span title={conf.help}>{conf.label}</span>
          </p>
          <p className="mt-2 text-[17px] leading-[27px] text-ink">
            {e.take.text} <ClaimRefs ids={e.take.claimIds} className="ml-0.5 align-middle" />
          </p>
          <p className="mt-3 text-xs text-ink-3">
            OpenLens's own reading of the evidence, written by AI. It weighs what every side reported against what independent sources confirm. It is not an endorsement of any party or side.
          </p>
        </div>
        {e.whatsNext ? (
          <p className="mt-4 text-[15px] leading-[23px] text-ink-2">
            <span className="font-semibold text-ink">What to watch next: </span>
            {e.whatsNext}
          </p>
        ) : null}
      </Block>
    </div>
  );
}
