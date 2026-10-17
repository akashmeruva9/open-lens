// NEXT_PUBLIC_* values are inlined at build time, so they are safe to read on server and client.
// The api origin (Cloud Run). On Vercel set it in Project Settings -> Environment Variables, then redeploy.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Server-only base for Server Component fetches. API_INTERNAL_URL is only set by a Vercel service binding
 * (not used now: the api runs on Cloud Run, where Firestore and Vertex credentials live). Falls back to API_URL.
 */
export const apiServerUrl = () => process.env.API_INTERNAL_URL || API_URL;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
