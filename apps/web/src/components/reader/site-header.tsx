import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { USE_FIXTURES } from "@/lib/env";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <Logo />
          {USE_FIXTURES ? (
            <span
              className="hidden rounded-md border border-dashed border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3 sm:inline"
              title="Serving fictional fixture data (NEXT_PUBLIC_USE_FIXTURES=1)"
            >
              Demo data
            </span>
          ) : null}
        </div>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <Link href="/#how" className="hidden rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
            How it works
          </Link>
          <Link href="/studio" className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            Studio
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer id="how" className="mt-16 border-t border-line">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 text-sm text-ink-2 sm:grid-cols-3">
        <div>
          <p className="eyebrow mb-2">The ledger</p>
          <p>Every sentence we publish cites atomic claims, and every claim quotes its source verbatim. Tap any claim to see the passage.</p>
        </div>
        <div>
          <p className="eyebrow mb-2">Lenses, not verdicts</p>
          <p>Lens lanes summarise how outlets with different ratings frame a story. They are model-generated framing, not a truth meter.</p>
        </div>
        <div>
          <p className="eyebrow mb-2">Corrections travel</p>
          <p>When a claim changes, every video, post and digest built on it is flagged for review and the correction is logged publicly.</p>
        </div>
      </div>
      <p className="mx-auto max-w-5xl px-4 pb-10 text-xs text-ink-3">
        OpenLens uses AI for research, drafting, translation and synthetic narration. Presenters are fictional and disclosed. Built for AI Builder Cup 2026.
      </p>
    </footer>
  );
}
