#!/usr/bin/env node
/**
 * One-off local OAuth consent flow that prints a YouTube refresh token.
 *
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... npm run youtube-auth -w @openlens/publisher -- [--tier regional]
 *
 * Use a "Desktop app" OAuth client. Sign in with the Google account that owns (or manages) the
 * target channel, pick the channel, and copy the printed token into Secret Manager.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { GOOGLE_TOKEN_URL } from "./channels/youtube.js";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl", // captions.insert, videos.update
];

async function main() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET (Desktop app OAuth client) first.");
    process.exit(1);
  }
  const tierIdx = process.argv.indexOf("--tier");
  const tier = tierIdx > -1 ? process.argv[tierIdx + 1] : undefined;
  const envName = tier ? `YOUTUBE_REFRESH_TOKEN_${tier.toUpperCase()}` : "YOUTUBE_REFRESH_TOKEN";

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  console.error(`\nOpen this URL in a browser and approve access:\n\n${authUrl}\n`);

  const code = await new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const u = new URL(req.url ?? "/", redirectUri);
      if (u.pathname !== "/callback") return void res.writeHead(404).end();
      const err = u.searchParams.get("error");
      const c = u.searchParams.get("code");
      if (err || !c || u.searchParams.get("state") !== state) {
        res.writeHead(400).end("Authorization failed. You can close this tab.");
        return reject(new Error(err ?? "missing code or state mismatch"));
      }
      res.writeHead(200, { "Content-Type": "text/plain" }).end("OpenLens: authorized. You can close this tab.");
      resolve(c);
    });
  });
  server.close();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = (await res.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.refresh_token) {
    console.error(`Token exchange failed: ${json.error ?? res.status} ${json.error_description ?? ""}`);
    process.exit(1);
  }
  console.error(`\nStore this in Secret Manager as ${envName} (do not commit it):\n`);
  console.log(`${envName}=${json.refresh_token}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
