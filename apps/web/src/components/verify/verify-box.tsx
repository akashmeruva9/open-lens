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
interface Article {
  kind: "article"; url: string; title: string; claims: Result[];
  summary: { checked: number; byStatus: Partial<Record<Status, number>>; headline: string };
}

const STATUS_TONE: Record<Status, string> = {
  supported: "--st-ok", contradicted: "--st-bad", disputed: "--st-warn", unconfirmed: "--st-warn", related_only: "--st-info", not_covered: "--st-muted",
};
const RELATION: Record<Finding["relation"], { label: string; tone: string }> = {
  supports: { label: "Says the same", tone: "--st-ok" },
  contradicts: { label: "Says the opposite", tone: "--st-bad" },
  related: { label: "Related", tone: "--st-muted" },
};
const EXAMPLES = ["Trump will livestream the execution of the Fort Hood shooter.", "Zelensky said he felt betrayed by the United States."];
const isLink = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {findings.map((f) => (
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
  );
}

/** One checked statement: status, explanation, the statement, and the ledger claims behind the answer. */
function ResultBlock({ r, compact = false }: { r: Result; compact?: boolean }) {
  return (
    <div>
      <Pill toneVar={STATUS_TONE[r.status]} className={compact ? "" : "!text-sm !px-3 !py-1"}>{r.headline}</Pill>
      {compact ? null : <p className="mt-3 text-[15px] leading-[22px] text-ink-2">{r.explanation}</p>}
      <p className={`${compact ? "mt-2" : "mt-3"} border-l-2 border-line-strong pl-3 text-[15px] italic text-ink-2`}>“{r.query}”</p>
      {compact ? <p className="mt-2 text-sm text-ink-2">{r.explanation}</p> : null}
      {r.findings.length ? <FindingList findings={r.findings} /> : null}
      {r.matching === "keywords" ? <p className="mt-3 text-xs text-ink-3">Matched by keywords only this time, so a differently worded version of the same claim may be missed.</p> : null}
    </div>
  );
}

export function VerifyBox({ initial }: { initial?: string }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result | Article>();
  const [copied, setCopied] = useState(false);
  const ran = useRef(false);

  const check = useCallback(async (statement: string) => {
    const t = statement.trim();
    if (t.length < 8) return setError("Write a full sentence, or paste a link to a news article.");
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const res = await fetch(`${API_URL}/v1/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.issues?.[0]?.message ?? body?.error ?? `Something went wrong (${res.status}).`);
      setResult(body as Result | Article);
      const url = new URL(window.location.href);
      url.searchParams.set("q", t);
      window.history.replaceState(null, "", url);
    } catch (e) {
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

  const article = result && "kind" in result ? result : undefined;
  const single = result && !("kind" in result) ? result : undefined;

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void check(text); }} className="mt-6">
        <label htmlFor="verify-text" className="sr-only">Claim or article link to check</label>
        <textarea
          id="verify-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3}
          placeholder="Paste one claim you have seen, or a link to a news article. For example: “Trump will livestream the execution of the Fort Hood shooter.”"
          className="w-full resize-y rounded-2xl border border-line bg-surface p-4 text-[16px] leading-[24px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-bg disabled:opacity-50">
            <IconSearch size={16} />
            {busy ? (isLink(text) ? "Reading the article and checking its claims…" : "Checking the ledgers…") : isLink(text) ? "Check this article" : "Check this claim"}
          </button>
          <span className="text-xs text-ink-3">{text.length}/600</span>
        </div>
        {busy && isLink(text) ? <p className="mt-3 text-sm text-ink-2">This can take up to a minute: we read the page, list its claims and check each one.</p> : null}
        {!result && !busy ? (
          <p className="mt-4 text-sm text-ink-2">
            Try:{" "}
            {EXAMPLES.map((ex, i) => (
              <button key={ex} type="button" onClick={() => { setText(ex); void check(ex); }} className="mr-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
                Example {i + 1}
              </button>
            ))}
            <span className="block pt-2 text-ink-3">Tip: one specific statement works best. Questions and opinions are hard to check.</span>
          </p>
        ) : null}
      </form>

      {error ? <p role="alert" className="mt-6 rounded-xl border border-line p-4 text-[15px] text-ink-2">{error}</p> : null}

      {result ? (
        <section aria-live="polite" className="mt-8">
          <div className="rounded-2xl border border-line p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {article ? <p className="eyebrow">Article check</p> : <span />}
              <button type="button" onClick={share} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-xs font-semibold text-ink-2 hover:text-ink">
                <IconShare size={14} />
                {copied ? "Link copied" : "Share this check"}
              </button>
            </div>

            {single ? <ResultBlock r={single} /> : null}

            {article ? (
              <div>
                <h2 className="display mt-2 text-[22px] leading-[26px]">{article.title || "Untitled article"}</h2>
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3 underline underline-offset-2 hover:text-ink">
                  {new URL(article.url).hostname}
                  <IconExternal size={11} />
                </a>
                <p className="mt-4 text-[16px] font-semibold leading-[24px] text-ink">{article.summary.headline}</p>
                <ul className="mt-5 space-y-5">
                  {article.claims.map((c, i) => (
                    <li key={c.query + i} className="rounded-xl border border-line p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Claim {i + 1}</p>
                      <ResultBlock r={c} compact />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <p className="mt-4 text-xs leading-[18px] text-ink-3">
            This checks what you pasted against OpenLens&apos;s own evidence ledgers, nothing else. It is not a verdict on the wider world, and an AI helps match wording{article ? " and pick the claims out of the article (only claims actually in the article are kept; the article itself is not stored)" : ""}. Every line above links to its sources.
          </p>
        </section>
      ) : null}
    </div>
  );
}
