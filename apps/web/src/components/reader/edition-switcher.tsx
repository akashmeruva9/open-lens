"use client";
import { MARKETS, MARKET_CODES, type MarketCode } from "@openlens/config";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { IconCheck, IconChevronDown, IconGlobe } from "@/components/ui/icons";
import { saveEdition } from "@/lib/edition";
import { langNative } from "@/lib/format";

const subtitle = (m: MarketCode) => (m === "APAC" ? "All markets · English desk" : MARKETS[m].languages.map(langNative).join(" · "));

/**
 * Dropdown listing JAPAC markets with native-language subtitles. Persists to a cookie, then re-renders on the server.
 * "pill" sits in the phone top bar; "sidebar" is the full-width row at the foot of the desktop sidebar and opens upwards.
 */
export function EditionSwitcher({ edition, variant = "pill" }: { edition: MarketCode; variant?: "pill" | "sidebar" }) {
  const sidebar = variant === "sidebar";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => MARKET_CODES.indexOf(edition));
  const [pending, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    setActive(MARKET_CODES.indexOf(edition));
    list.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, edition]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(m: MarketCode) {
    setOpen(false);
    btn.current?.focus();
    if (m === edition) return;
    saveEdition(m);
    start(() => router.refresh());
  }

  function onKey(e: KeyboardEvent) {
    const n = MARKET_CODES.length;
    if (e.key === "ArrowDown") setActive((i) => (i + 1) % n);
    else if (e.key === "ArrowUp") setActive((i) => (i - 1 + n) % n);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Enter" || e.key === " ") choose(MARKET_CODES[active]);
    else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") btn.current?.focus();
      return;
    } else return;
    e.preventDefault();
  }

  return (
    <div ref={wrap} className={`relative ${sidebar ? "w-full" : ""}`}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Edition: ${MARKETS[edition].name}. Change edition`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`${
          sidebar
            ? "flex h-11 w-full items-center gap-2 rounded-md px-2.5 text-[14px] font-semibold text-ink hover:bg-surface"
            : "inline-flex h-10 items-center gap-1 rounded-full border border-line bg-bg pl-2.5 pr-2 sm:gap-1.5 sm:pl-3 sm:pr-2.5 text-sm font-semibold text-ink hover:border-ink-3"
        } ${pending ? "opacity-60" : ""}`}
      >
        <IconGlobe size={16} className="shrink-0 text-ink-2" />
        <span className={`truncate ${sidebar ? "flex-1 text-left" : "max-w-[5.5rem] sm:max-w-[9.5rem]"}`}>
          {MARKETS[edition].name}
        </span>
        <IconChevronDown size={16} className={`shrink-0 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Choose your edition"
          aria-activedescendant={`${listId}-${MARKET_CODES[active]}`}
          onKeyDown={onKey}
          className={`absolute z-50 max-h-[min(70vh,520px)] w-72 overflow-y-auto rounded-lg border border-line bg-bg p-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.16)] focus:outline-none ${
            sidebar ? "bottom-12 left-0" : "right-0 top-12"
          }`}
        >
          {MARKET_CODES.map((m, i) => {
            const selected = m === edition;
            return (
              <li
                key={m}
                id={`${listId}-${m}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                onClick={() => choose(m)}
                onMouseMove={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 ${i === active ? "bg-surface" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{MARKETS[m].name}</span>
                  <span className="block truncate text-xs text-ink-3">{subtitle(m)}</span>
                </span>
                {selected ? <IconCheck size={16} className="shrink-0 text-accent" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <span className="sr-only" aria-live="polite">{pending ? "Loading edition…" : ""}</span>
    </div>
  );
}
