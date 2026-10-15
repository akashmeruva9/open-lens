"use client";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { IconCheck, IconShare } from "@/components/ui/icons";

export function ShareButton({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  const [msg, setMsg] = useState("");

  async function share() {
    const url = window.location.href.split("#")[0];
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
    <div className={`relative ${compact ? "flex" : "inline-flex items-center"}`}>
      <button type="button" onClick={share} className={buttonClass("secondary", compact ? "md" : "lg", compact ? "w-full" : "")}>
        {msg === "Link copied" ? <IconCheck size={16} /> : <IconShare size={16} />}
        {compact && msg ? msg : "Share"}
      </button>
      <span role="status" aria-live="polite" className={compact ? "sr-only" : "ml-2 text-xs text-ink-3"}>{msg}</span>
    </div>
  );
}
