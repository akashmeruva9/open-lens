import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Vercel builds read the production api (Cloud Run) unless NEXT_PUBLIC_API_URL is set in the project.
const CLOUD_API = "https://openlens-api-42lefjl5bq-uc.a.run.app";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.VERCEL ? CLOUD_API : "");

const nextConfig: NextConfig = {
  ...(apiUrl ? { env: { NEXT_PUBLIC_API_URL: apiUrl } } : {}),
  reactStrictMode: true,
  agentRules: false,
  // Cloud Run image (apps/web/Dockerfile) runs the traced standalone server.
  output: "standalone",
  // Monorepo: shared packages live in /packages.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
