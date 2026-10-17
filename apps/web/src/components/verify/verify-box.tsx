"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EvidenceChip, Pill } from "@/components/ui/chips";
import { IconExternal, IconSearch, IconShare } from "@/components/ui/icons";
import { API_URL } from "@/lib/env";

type Status = "supported" | "contradicted" | "disputed" | "unconfirmed" | "related_only" | "not_covered";
interface Finding {
  storyId: string; storyTitle: string; claimId: string; text: string; state: string; attributedTo?: string;
  sources: { publisher: string; url: string }[]; similarity: number; relation: "supports" | "contradicts" | "related";
}
interface Result {
  query: string; status: Status; headline: string; explanation: string; findings: Finding[];
  stories: { id: string; title: string }[]; matching: "semantic" | "keywords";
}

const STATUS_TONE: Record<Status, string> = {
  supported: "--st-ok", contradicted: "--st-bad", disputed: "--st-warn", unconfirmed: "--st-warn", related_only: "--st-info", not_covered: "--st-muted",
};
const RELATION: Record<Finding["relation"], { label: string; tone: string }> = {
  supports: { label: "Says the same", tone: "--st-ok" },
  contradicts: { label: "Says the opposite", tone: "--st-bad" },
  related: { label: "Related", tone: "--st-muted" },
};
const EXAMPLES = ["The Reserve Bank of Australia raised interest rates this month.", "Ukraine's army lost access to Starlink after the US switched it off."];

export function VerifyBox({ initial }: { initial?: string }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [copied, setCopied] = useState(false);
  const ran = useRef(false);

  const check = useCallback(async (statement: string) => {
    const t = statement.trim();
    if (t.length < 8) return setError("Write a full sentence so we have something to check.");
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`${API_URL}/v1/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.issues?.[0]?.message ?? body?.error ?? `Something went wrong (${res.status}).`);
      setResult(body as Result);
      const url = new URL(window.location.href);
      url.searchParams.set("q", t);
      window.history.replaceState(null, "", url);
    } catch (e) {
      setResult(undefined);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (initial && !ran.current) {
      ran.current = true;
      void check(initial);
    }
  }, [initial, check]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the address bar already holds the link */
    }
  };

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void check(text); }} className="mt-6">
        <label htmlFor="verify-text" className="sr-only">Claim to check</label>
        <textarea
          id="verify-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3}
          placeholder="Paste a claim you have seen, for example: “Ukraine's army lost access to Starlink after the US switched it off.”"
          className="w-full resize-y rounded-2xl border border-line bg-surface p-4 text-[16px] leading-[24px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-bg disabled:opacity-50">
            <IconSearch size={16} />
            {busy ? "Checking the ledgers…" : "Check this claim"}
          </button>
          <span className="text-xs text-ink-3">{text.length}/600</span>
        </div>
        {!result && !busy ? (
          <p className="mt-4 text-sm text-ink-2">
            Try:{" "}
            {EXAMPLES.map((ex, i) => (
              <button key={ex} type="button" onClick={() => { setText(ex); void check(ex); }} className="mr-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
                Example {i + 1}
              </button>
            ))}
          </p>
        ) : null}
      </form>

      {error ? <p role="alert" className="mt-6 rounded-xl border border-line p-4 text-[15px] text-ink-2">{error}</p> : null}

      {result ? (
        <section aria-live="polite" className="mt-8">
          <div className="rounded-2xl border border-line p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Pill toneVar={STATUS_TONE[result.status]} className="!text-sm !px-3 !py-1">{result.headline}</Pill>
              <button type="button" onClick={share} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-xs font-semibold text-ink-2 hover:text-ink">
                <IconShare size={14} />
                {copied ? "Link copied" : "Share this check"}
              </button>
            </div>
            <p className="mt-3 text-[15px] leading-[22px] text-ink-2">{result.explanation}</p>
            <p className="mt-3 border-l-2 border-line-strong pl-3 text-[15px] italic text-ink-2">“{result.query}”</p>

            {result.findings.length ? (
              <ul className="mt-6 space-y-4">
                {result.findings.map((f) => (
                  <li key={f.claimId + f.storyId} className="rounded-xl bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill toneVar={RELATION[f.relation].tone}>{RELATION[f.relation].label}</Pill>
                      <EvidenceChip state={f.state} />
                    </div>
                    <p className="mt-2 text-[16px] leading-[24px] text-ink">
                      {f.attributedTo ? <span className="text-ink-3">{f.attributedTo}: </span> : null}
                      {f.text}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                      {f.sources.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-2 hover:text-ink">
                          {s.publisher}
                          <IconExternal size={11} />
                        </a>
                      ))}
                      <Link href={`/story/${f.storyId}`} className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Open the story</Link>
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {result.matching === "keywords" ? <p className="mt-4 text-xs text-ink-3">Matched by keywords only this time, so a differently worded version of the same claim may be missed.</p> : null}
          </div>
          <p className="mt-4 text-xs leading-[18px] text-ink-3">
            This checks your sentence against OpenLens&apos;s own evidence ledgers, nothing else. It is not a verdict on the wider world, and an AI helps match wording. Every line above links to its sources.
          </p>
        </section>
      ) : null}
    </div>
  );
}
