import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="font-serif text-3xl font-semibold">Not in the ledger</h1>
      <p className="text-ink-2">We couldn&apos;t find that page or story. It may have been retracted or never published.</p>
      <Link href="/" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg">Back to the feed</Link>
    </main>
  );
}
