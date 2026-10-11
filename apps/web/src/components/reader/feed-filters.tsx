"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { langName, langNative, regionName } from "@/lib/format";

const LANGS = ["en", "hi", "te", "es"];
const REGIONS = ["IN-TG", "IN-KA", "IN-MH", "IN-DL"];

export function FeedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  const lang = params.get("lang") ?? "";
  const region = params.get("region") ?? "";

  return (
    <form role="search" aria-label="Filter stories" className="flex flex-wrap items-center gap-2" onSubmit={(e) => e.preventDefault()}>
      <label className="sr-only" htmlFor="f-lang">Language</label>
      <select id="f-lang" value={lang} onChange={(e) => set("lang", e.target.value)}
        className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink">
        <option value="">All languages</option>
        {LANGS.map((l) => (
          <option key={l} value={l}>{langNative(l)}{l !== "en" ? ` · ${langName(l)}` : ""}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-region">Region</label>
      <select id="f-region" value={region} onChange={(e) => set("region", e.target.value)}
        className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink">
        <option value="">All regions</option>
        {REGIONS.map((r) => (
          <option key={r} value={r}>{regionName(r)}</option>
        ))}
      </select>
      {(lang || region) && (
        <button type="button" onClick={() => start(() => router.replace(pathname, { scroll: false }))}
          className="h-9 rounded-lg px-2.5 text-sm text-ink-2 underline-offset-4 hover:underline">
          Clear
        </button>
      )}
      <span aria-live="polite" className="text-xs text-ink-3">{pending ? "Updating…" : ""}</span>
    </form>
  );
}
