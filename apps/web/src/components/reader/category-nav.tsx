"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IconArticle, IconFilm, IconSearch, IconShieldCheck } from "@/components/ui/icons";
import { CategoryIcon, NAV_ITEMS } from "./category-icons";

/** Formats and tools listed under the categories in the sidebar. */
const SECONDARY: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/browse/videos", label: "Videos", icon: <IconFilm size={18} /> },
  { href: "/browse/explainers", label: "Explainers", icon: <IconArticle size={18} /> },
  { href: "/browse/corrected", label: "Corrections", icon: <IconShieldCheck size={18} /> },
  { href: "/browse/wire?focus=search", label: "Search", icon: <IconSearch size={18} /> },
];

function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  return path === "/" ? pathname === "/" : pathname === path;
}

/**
 * Category navigation.
 * - "sidebar": vertical icon + label list (desktop left rail), with formats below a divider.
 * - "strip": icon-over-label row that scrolls sideways under the phone top bar.
 */
export function CategoryNav({ variant }: { variant: "sidebar" | "strip" }) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    const row = (href: string, label: string, icon: ReactNode) => {
      const active = isActive(pathname, href);
      return (
        <li key={href}>
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 items-center gap-3 rounded-md px-2.5 text-[15px] leading-5 transition-colors ${
              active ? "bg-ink font-semibold text-bg" : "font-medium text-ink hover:bg-surface"
            }`}
          >
            <span aria-hidden className="inline-flex w-[18px] shrink-0 justify-center">{icon}</span>
            <span className="truncate">{label}</span>
          </Link>
        </li>
      );
    };
    return (
      <nav aria-label="Sections">
        <ul className="grid gap-0.5">{NAV_ITEMS.map((it) => row(it.href, it.label, <CategoryIcon slug={it.slug} size={18} />))}</ul>
        <hr className="mx-2.5 my-3 border-line" />
        <ul className="grid gap-0.5">{SECONDARY.map((it) => row(it.href, it.label, it.icon))}</ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Categories" className="no-scrollbar overflow-x-auto">
      <ul className="flex w-max gap-1 px-2.5 sm:px-3.5">
        {NAV_ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <li key={it.slug}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-[64px] flex-col items-center gap-1 rounded-md px-2.5 pb-1.5 pt-2 text-center transition-colors ${
                  active ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                <CategoryIcon slug={it.slug} size={20} />
                <span className="whitespace-nowrap text-[11px] font-semibold leading-3">{it.label}</span>
                <span aria-hidden className={`absolute inset-x-2.5 -bottom-px h-[3px] rounded-full ${active ? "bg-ink" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
