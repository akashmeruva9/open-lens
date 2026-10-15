"use client";
import { useEffect, useRef } from "react";

/** Locate a verbatim passage inside the source text (exact, then case/whitespace-insensitive). */
export function locate(text: string, passage: string): [number, number] | null {
  const i = text.indexOf(passage);
  if (i >= 0) return [i, i + passage.length];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const j = norm(text).indexOf(norm(passage).trim());
  return j >= 0 ? [j, j + norm(passage).trim().length] : null;
}

/** Source text with the cited passage highlighted and scrolled into view. */
export function SourceWithPassage({ text, passage }: { text: string; passage: string }) {
  const ref = useRef<HTMLElement>(null);
  const box = useRef<HTMLParagraphElement>(null);
  const span = locate(text, passage);
  useEffect(() => {
    // Scroll only the text box (not the page) so the highlight is visible.
    if (box.current && ref.current) box.current.scrollTop = Math.max(0, ref.current.offsetTop - 24);
  }, [passage]);

  if (!span) {
    return (
      <div className="space-y-2">
        <blockquote className="border-l-2 border-brand pl-3 text-[15px] italic text-ink">“{passage}”</blockquote>
        <p className="text-xs text-ink-3">Passage could not be located in the stored source text.</p>
      </div>
    );
  }
  const [a, b] = span;
  return (
    <p ref={box} className="relative max-h-56 overflow-y-auto whitespace-pre-line text-[15px] leading-relaxed text-ink-2">
      {text.slice(0, a)}
      <mark ref={ref} className="passage text-ink">{text.slice(a, b)}</mark>
      {text.slice(b)}
    </p>
  );
}
