import { MARKETS, MARKET_CODES } from "@openlens/config";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { IconSearch } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { USE_FIXTURES } from "@/lib/env";
import { readEdition } from "@/lib/edition-server";
import { CategoryNav } from "./category-nav";
import { NAV_ITEMS } from "./category-icons";
import { EditionSwitcher } from "./edition-switcher";

export async function SiteHeader() {
  const edition = await readEdition();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <div className="page flex h-16 items-center gap-3">
        <Logo />
        {USE_FIXTURES ? (
          <span className="hidden rounded-full border border-dashed border-ink-3 px-2 py-0.5 text-[11px] font-semibold text-ink-3 2xl:inline"
            title="Serving fictional fixture data (NEXT_PUBLIC_USE_FIXTURES=1)">
            Demo data
          </span>
        ) : null}
        <div className="mx-auto hidden xl:block">
          <CategoryNav variant="inline" />
        </div>
        <div className="ml-auto flex items-center gap-1 xl:ml-0">
          <EditionSwitcher edition={edition} />
          <Link href="/browse/wire?focus=search" aria-label="Search stories"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface">
            <IconSearch size={20} />
          </Link>
          <ThemeToggle />
          <Link href="/studio" className="hidden h-10 items-center rounded-full px-3 text-sm font-semibold text-ink-2 hover:bg-surface hover:text-ink sm:inline-flex">
            Studio
          </Link>
        </div>
      </div>
      <div className="border-t border-line xl:hidden">
        <CategoryNav variant="strip" />
      </div>
    </header>
  );
}

const ABOUT = [
  { href: "/about#verify", label: "How we verify" },
  { href: "/about#ai-disclosure", label: "AI disclosure policy" },
  { href: "/about#corrections", label: "Corrections" },
  { href: "/about#lenses", label: "Lenses, not verdicts" },
  { href: "/studio", label: "Newsroom studio" },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-[#0a0a0a] text-[#f5f5f5] dark:border-t dark:border-line">
      <div className="page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="text-[#f5f5f5] [&_a]:text-[#f5f5f5]">
            <Logo size="lg" />
          </div>
          <p className="mt-4 text-sm leading-6 text-[#c7c7c7]">
            Video-first news for Asia-Pacific that you can inspect. Every sentence cites a claim; every claim quotes its source.
          </p>
          <ul aria-label="Follow OpenLens" className="mt-5 flex flex-wrap gap-2">
            {["Video channels · 13 languages", "Daily digest", "RSS"].map((s) => (
              <li key={s}>
                <span className="inline-flex rounded-full border border-[#3d3d3d] px-3 py-1 text-xs font-semibold text-[#c7c7c7]" title="Coming soon">{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <FooterCol title="Editions">
          {MARKET_CODES.map((m) => (
            <li key={m}><Link href={m === "APAC" ? "/browse/wire" : `/browse/${m.toLowerCase()}`} className="hover:text-white hover:underline">{MARKETS[m].name}</Link></li>
          ))}
        </FooterCol>
        <FooterCol title="Categories">
          {NAV_ITEMS.map((n) => (
            <li key={n.slug}><Link href={n.href} className="hover:text-white hover:underline">{n.label}</Link></li>
          ))}
          <li><Link href="/browse/videos" className="hover:text-white hover:underline">Videos</Link></li>
          <li><Link href="/browse/explainers" className="hover:text-white hover:underline">Explainers</Link></li>
        </FooterCol>
        <FooterCol title="About OpenLens">
          {ABOUT.map((a) => (
            <li key={a.href}><Link href={a.href} className="hover:text-white hover:underline">{a.label}</Link></li>
          ))}
        </FooterCol>
      </div>
      <div className="border-t border-[#2a2a2a]">
        <div className="page flex flex-col gap-2 py-6 text-xs leading-5 text-[#8c8c8c] sm:flex-row sm:items-center sm:justify-between">
          <p>
            OpenLens uses AI for research, drafting, translation and synthetic narration. Presenters are fictional and disclosed.
            {USE_FIXTURES ? " This deployment shows fictional demo stories." : ""}
          </p>
          <p className="shrink-0">© 2026 OpenLens · Built for AI Builder Cup 2026</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="display text-[15px] text-white">{title}</h2>
      <ul className="mt-3 grid gap-1.5 text-sm text-[#c7c7c7] [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))] lg:grid-cols-1">{children}</ul>
    </div>
  );
}
