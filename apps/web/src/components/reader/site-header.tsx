import { MARKETS, MARKET_CODES } from "@openlens/config";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { IconArrowUpRight, IconSearch } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { readEdition } from "@/lib/edition-server";
import { CategoryNav } from "./category-nav";
import { NAV_ITEMS } from "./category-icons";
import { EditionSwitcher } from "./edition-switcher";

/** Desktop: fixed left sidebar with wordmark, sections, about links and the edition switcher pinned to the foot. */
export async function SiteSidebar() {
  const edition = await readEdition();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-bg lg:flex">
      <div className="px-5 pb-6 pt-7">
        <Logo />
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5">
        <CategoryNav variant="sidebar" />
        <hr className="mx-2.5 my-3 border-line" />
        <ul aria-label="About OpenLens" className="grid gap-1 px-2.5 pb-4">
          {ABOUT.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="inline-flex items-center gap-1 text-[13px] font-semibold leading-6 text-ink-2 hover:text-ink">
                {a.label} <IconArrowUpRight size={12} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2.5">
        <div className="min-w-0 flex-1">
          <EditionSwitcher edition={edition} variant="sidebar" />
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}

/** Phone and tablet: sticky top bar with the category strip underneath. */
export async function MobileHeader() {
  const edition = await readEdition();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85 lg:hidden">
      <div className="page flex h-14 items-center gap-2">
        <Logo />
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <EditionSwitcher edition={edition} />
          <Link href="/browse/wire?focus=search" aria-label="Search stories"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface">
            <IconSearch size={20} />
          </Link>
          <ThemeToggle />
        </div>
      </div>
      <div className="border-t border-line">
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
