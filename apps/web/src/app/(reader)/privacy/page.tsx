import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy", description: "What OpenLens collects, what it does not, and how to ask us to delete something." };

const SECTIONS = [
  {
    title: "The short version",
    body: [
      "OpenLens is a news reader. You do not need an account, we do not run advertising or tracking scripts, and we do not sell anything about you.",
    ],
  },
  {
    title: "What the website stores on your device",
    body: [
      "Two small settings, so the site remembers you: the edition (market) you picked, in a cookie called openlens_edition, and your light or dark theme, in your browser's local storage. Neither identifies you. Clear your browser data to remove them.",
    ],
  },
  {
    title: "Verify this",
    body: [
      "When you paste a claim or an article link into Verify this, the text is sent to our server and compared with the claims in our own evidence ledgers. An AI model (Google Gemini, through Google Cloud) helps match the wording and, for a link, list the claims in the article. A link is opened by our server only to read the page; the article text is not stored.",
      "If we have nothing that matches, the claim itself (never your address or any identifier) is added to a short list our newsroom can read, so we know what readers ask about. Please do not paste personal information into it.",
    ],
  },
  {
    title: "Optional alerts and digests",
    body: [
      "If you opt in to push alerts or a WhatsApp digest, we store the device token or phone number, your language and region, and the time you agreed, only to send what you asked for. You can opt out in the app at any time, which removes the record.",
    ],
  },
  {
    title: "Our social accounts",
    body: [
      "OpenLens publishes its stories as videos on YouTube, Instagram and Facebook from its own accounts. The tool that uploads them signs in to those accounts as OpenLens. It does not read, collect or store data about anyone who watches, follows or comments.",
    ],
  },
  {
    title: "Where it is processed",
    body: [
      "OpenLens runs on Google Cloud. Server logs (technical details such as time and page requested) are kept by Google Cloud for operations and security.",
    ],
  },
  {
    title: "Questions or deletion requests",
    body: [
      "Open an issue at github.com/akashmeruva9/open-lens and say what you would like removed. This is a hackathon project, but we will act on any request.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="page pb-8 pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <p className="eyebrow">OpenLens</p>
        <h1 className="display mt-2 text-[30px] leading-[34px] sm:text-[40px] sm:leading-[44px]">Privacy</h1>
        {SECTIONS.map((s, i) => (
          <section key={s.title} aria-labelledby={`p${i}`} className="mt-10">
            <h2 id={`p${i}`} className="display text-[22px] leading-[26px]">{s.title}</h2>
            {s.body.map((p, j) => (
              <p key={j} className="mt-3 text-base leading-6 text-ink-2">{p}</p>
            ))}
          </section>
        ))}
        <p className="mt-10 text-sm text-ink-3">Last updated 18 October 2026.</p>
      </div>
    </div>
  );
}
