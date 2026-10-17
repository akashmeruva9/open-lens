// NEXT_PUBLIC_* values are inlined at build time, so they are safe to read on server and client.
// On Vercel this is the relative public path "/api" (browser asset/media URLs); locally and on Cloud Run, the api origin.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Server-only base for Server Component fetches. On Vercel, API_INTERNAL_URL is injected at runtime by the
 * web -> api service binding (vercel.json); never set it by hand. Elsewhere it falls back to API_URL.
 */
export const apiServerUrl = () => process.env.API_INTERNAL_URL || API_URL;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
