"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconArrowRight, IconChevronLeft, IconChevronRight } from "@/components/ui/icons";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function RailHeader({ id, icon, title, subtitle, href, viewAllLabel }: {
  id: string; icon?: ReactNode; title: string; subtitle?: ReactNode; href?: string; viewAllLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bg">{icon}</span> : null}
        <div className="min-w-0">
          <h2 id={id} className="display text-[22px] leading-[26px] sm:text-[24px] sm:leading-[28px]">{title}</h2>
          {subtitle ? <p className="mt-0.5 truncate text-xs font-medium text-ink-3">{subtitle}</p> : null}
        </div>
      </div>
      {href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full text-sm font-semibold text-accent hover:underline underline-offset-4"
          aria-label={viewAllLabel ?? `View all: ${title}`}>
          View all <IconArrowRight size={16} />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Horizontal scroll-snap rail. Desktop shows ~5.5 items (arrows on hover/focus), phone ~2.3.
 * Keyboard: Tab moves through cards (scrolled into view natively); Left/Right arrows jump card to card.
 */
export function Rail({
  title, subtitle, icon, href, items, variant = "video", className = "",
}: {
  title: string; subtitle?: ReactNode; icon?: ReactNode; href?: string; items: { key: string; node: ReactNode }[];
  variant?: "video" | "article"; className?: string;
}) {
  const headingId = useId();
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update, items.length]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  function onKey(e: KeyboardEvent<HTMLUListElement>) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(":scope > li > a, :scope > li > article a"));
    const i = links.findIndex((l) => l === document.activeElement || l.contains(document.activeElement));
    if (i < 0) return;
    const next = links[Math.min(links.length - 1, Math.max(0, i + dir))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  if (!items.length) return null;
  const widths =
    variant === "video"
      ? "w-[calc((100%-24px)/2.3)] sm:w-[calc((100%-48px)/3.5)] lg:w-[calc((100%-80px)/5.5)]"
      : "w-[calc((100%-12px)/1.25)] sm:w-[calc((100%-32px)/2.4)] lg:w-[calc((100%-48px)/3.4)]";

  return (
    <section aria-labelledby={headingId} aria-roledescription="carousel" className={`page group/rail mt-12 first:mt-0 ${className}`}>
      <RailHeader id={headingId} icon={icon} title={title} subtitle={subtitle} href={href} />
      <div className="relative">
        <ul
          ref={track}
          onKeyDown={onKey}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:scroll-px-5 sm:gap-4 sm:px-5"
        >
          {items.map((it, i) => (
            <li key={it.key} aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`} className={`relative shrink-0 snap-start ${widths}`}>
              {it.node}
            </li>
          ))}
        </ul>
        <RailArrow dir={-1} hidden={edges.start} onClick={() => page(-1)} label={`Scroll ${title} back`} />
        <RailArrow dir={1} hidden={edges.end} onClick={() => page(1)} label={`Scroll ${title} forward`} />
      </div>
    </section>
  );
}

function RailArrow({ dir, hidden, onClick, label }: { dir: 1 | -1; hidden: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      tabIndex={-1}
      onClick={onClick}
      className={`absolute top-[calc(50%-36px)] z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-bg text-ink shadow-[0_2px_12px_rgb(0_0_0/0.18)] ring-1 ring-line transition-opacity hover:bg-surface md:inline-flex ${
        dir < 0 ? "-left-3" : "-right-3"
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-0 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100"}`}
    >
      {dir < 0 ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />}
    </button>
  );
}
