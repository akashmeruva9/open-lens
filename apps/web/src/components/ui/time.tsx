"use client";
import { useEffect, useState } from "react";
import { absoluteTime, relativeTime } from "@/lib/format";

/** Relative time that re-renders on the client (server value may differ slightly). */
export function RelTime({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso} title={absoluteTime(iso)} suppressHydrationWarning>
      {prefix}
      {relativeTime(iso)}
    </time>
  );
}
