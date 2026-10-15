"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CategoryIcon, NAV_ITEMS } from "./category-icons";

/** Icon-over-label category row. Inline in the header on wide screens; a scrollable strip on phones. */
export function CategoryNav({ variant }: { variant: "inline" | "strip" }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Categories" className={variant === "strip" ? "no-scrollbar overflow-x-auto" : "min-w-0"}>
      <ul className={`flex ${variant === "strip" ? "w-max gap-1 px-2.5 sm:px-3.5" : "gap-0.5"}`}>
        {NAV_ITEMS.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname === it.href;
          return (
            <li key={it.slug}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-md px-2.5 pb-1.5 pt-2 text-center transition-colors ${
                  active ? "text-ink" : "text-ink-2 hover:text-ink"
                } ${variant === "strip" ? "min-w-[64px]" : ""}`}
              >
                <CategoryIcon slug={it.slug} size={20} />
                <span className="whitespace-nowrap text-[11px] font-semibold leading-3">{it.label}</span>
                <span aria-hidden className={`absolute inset-x-2.5 -bottom-px h-[3px] rounded-full ${active ? "bg-accent" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
