"use client";
import { useState } from "react";
import { IconCheck, IconShare } from "@/components/ui/icons";

export function ShareButton({ title, text }: { title: string; text: string }) {
  const [msg, setMsg] = useState("");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg("Link copied");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setMsg("Link copied");
      } catch {
        setMsg("Copy failed");
      }
    }
    setTimeout(() => setMsg(""), 2200);
  }

  return (
    <div className="relative inline-flex items-center">
      <button type="button" onClick={share}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2">
        {msg === "Link copied" ? <IconCheck size={15} /> : <IconShare size={15} />}
        Share
      </button>
      <span role="status" aria-live="polite" className="ml-2 text-xs text-ink-3">{msg}</span>
    </div>
  );
}
