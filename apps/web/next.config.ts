import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
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
