import type { Metadata } from "next";

export const metadata: Metadata = { title: "About OpenLens" };

const SECTIONS = [
  {
    id: "verify",
    title: "How we verify",
    body: [
      "Every story starts as a ledger of atomic claims. Each claim quotes the exact passage from its source, records who said it, and carries an evidence state: supported, contested, attributed or unverified.",
      "Every sentence we publish, in every language and format, cites ledger claims. Tap any claim chip to see the highlighted passage in the original source.",
    ],
  },
  {
    id: "sources",
    title: "Where the news comes from",
    body: [
      "Every 15 minutes the OpenLens wire reads the public news feeds of about a hundred outlets worldwide and official government sources. An event becomes a story when at least two independent outlets report it, or an official source announces it.",
      "We read each article only to extract facts. What you see is OpenLens's own writing, with every outlet credited and linked, and at most a short quote from it. We respect each site's robots.txt and skip paywalled articles.",
      "Stories are researched, written and published automatically, without editor review, and are labelled that way. If an automated check finds a problem, the story says so.",
    ],
  },
  {
    id: "ai-disclosure",
    title: "AI disclosure policy",
    body: [
      "OpenLens uses AI for research, drafting, translation and synthetic narration. Video presenters are fictional, disclosed personas with synthetic voices; they are never modelled on a real journalist.",
      "Every video carries an on-screen disclosure in its own language that also says “AI-generated”. Visuals are rendered from the ledger, not real footage.",
    ],
  },
  {
    id: "corrections",
    title: "Corrections",
    body: [
      "When a claim changes, the ledger version increases and every video, post and digest built on that claim is flagged for review. The correction, its reason and the changed claims are shown on the story.",
    ],
  },
  {
    id: "lenses",
    title: "Lenses, not verdicts",
    body: [
      "Lens lanes summarise how outlets with different documented ratings frame a story. They are model-generated framing, not a truth meter. Left/centre/right is not a universal axis across Asia-Pacific; ratings must cite a per-market basis or stay unrated.",
      "Each outlet's left / centre / right label comes from a published media-bias rater (Media Bias/Fact Check or AllSides), named with a link on every source. Outlets no rater covers stay unrated.",
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="page pb-8 pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <p className="eyebrow">About OpenLens</p>
        <h1 className="display mt-2 text-[30px] leading-[34px] sm:text-[40px] sm:leading-[44px]">News you can inspect.</h1>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-12 scroll-mt-28">
            <h2 id={`${s.id}-h`} className="display text-[24px] leading-[28px]">{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-3 text-base leading-6 text-ink-2">{p}</p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
