// NEXT_PUBLIC_* values are inlined at build time, so they are safe to read on server and client.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";


export const AUTH_MODE: "dev" | "firebase" =
  process.env.NEXT_PUBLIC_AUTH_MODE === "firebase" ? "firebase" : "dev";

export const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER || "editor@dev";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
