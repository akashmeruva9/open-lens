import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size="lg" />
      <h1 className="display mt-4 text-[40px] leading-[44px]">Not in the ledger</h1>
      <p className="text-ink-2">We couldn&apos;t find that page or story. It may have been retracted or never published.</p>
      <Link href="/" className={buttonClass("primary", "lg", "mt-2")}>Back to the front page</Link>
    </main>
  );
}
