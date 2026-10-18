import type { Metadata } from "next";
import { VerifyBox } from "@/components/verify/verify-box";
import { IconShieldCheck } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Verify this",
  description: "Paste a claim or an article link and see what the OpenLens evidence ledgers say about it: supported, contradicted, disputed or not yet confirmed, with the sources.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 600) : undefined;
  return (
    <div className="page pb-12 pt-8 sm:pt-12">
      <header className="border-b border-line pb-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="hidden size-12 items-center justify-center rounded-md border border-line-strong text-ink sm:inline-flex"><IconShieldCheck size={22} /></span>
          <div>
            <h1 className="display text-[32px] leading-[36px] sm:text-[48px] sm:leading-[50px]">Verify this</h1>
            <p className="mt-1 max-w-2xl text-[15px] leading-[22px] text-ink-2">
              Seen a claim online, or a news article? Paste the claim, or the article link. We compare it with the claims in our evidence ledgers and show what is supported, what is disputed and what nobody has confirmed, with the sources.
            </p>
          </div>
        </div>
      </header>
      <div className="max-w-3xl">
        <VerifyBox initial={q} />
      </div>
    </div>
  );
}
