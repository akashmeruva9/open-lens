"use client";
import { useEffect } from "react";

/** Registers /sw.js in production builds (dev skips it to avoid stale HMR caches). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
