#!/usr/bin/env node
/**
 * One-off helper: turn a short-lived Graph API Explorer user token into the credentials the Instagram publisher needs.
 *
 *   npm run meta-auth -w @openlens/publisher -- --lang en
 *
 * Prompts (input hidden) for the app secret and the short-lived user token, exchanges it for a long-lived token,
 * lists the Pages you manage that have a linked Instagram professional account, and writes
 *   IG_USER_ID_<LANG>, FB_PAGE_ID_<LANG> and META_PAGE_ACCESS_TOKEN_<LANG>
 * into ~/.openlens/instagram.env (owner-only). A Page token obtained from a long-lived user token does not expire.
 * Nothing secret is printed.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { graphBase } from "./env.js";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const lang = (flag("lang") ?? "en").toUpperCase().replace(/-/g, "_");
const appId = flag("app-id") ?? process.env.META_APP_ID;

function ask(question: string, hidden: boolean): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stderr.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stderr.write("\n");
      resolve(a.trim());
    });
    muted = hidden;
  });
}

async function get(path: string, params: Record<string, string>) {
  const url = `${graphBase()}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const json = (await res.json()) as any;
  if (!res.ok || json.error) throw new Error(`${path}: ${json.error?.message ?? res.status}`);
  return json;
}

async function main() {
  const id = appId ?? (await ask("Meta app ID: ", false));
  const secret = process.env.META_APP_SECRET ?? (await ask("App secret (hidden): ", true));
  const short = process.env.META_USER_TOKEN ?? (await ask("Short-lived user token from Graph API Explorer (hidden): ", true));
  if (!id || !secret || !short) throw new Error("app id, app secret and token are all required");

  const ll = await get("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short });
  const longToken = ll.access_token as string;
  console.error(`long-lived user token obtained (expires in about ${Math.round(Number(ll.expires_in ?? 0) / 86400)} days; Page tokens from it do not expire)`);

  const pages = (await get("/me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50", access_token: longToken })).data as any[];
  const withIg = pages.filter((p) => p.instagram_business_account?.id);
  console.error(`\nPages you manage: ${pages.map((p) => p.name).join(", ") || "none"}`);
  if (!withIg.length) throw new Error("no Page with a linked Instagram professional account was returned; check the Page link and the token's permissions");
  const want = flag("page");
  const page = want ? withIg.find((p) => p.name === want || p.id === want) : withIg.length === 1 ? withIg[0] : undefined;
  if (!page) throw new Error(`several Pages have Instagram linked (${withIg.map((p) => `${p.name} -> @${p.instagram_business_account.username}`).join(", ")}); rerun with --page "<name or id>"`);

  const dir = join(homedir(), ".openlens");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "instagram.env");
  const mine = [`IG_USER_ID_${lang}=`, `FB_PAGE_ID_${lang}=`, `META_PAGE_ACCESS_TOKEN_${lang}=`];
  const keep = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l && !mine.some((m) => l.startsWith(m))) : [];
  keep.push(`IG_USER_ID_${lang}=${page.instagram_business_account.id}`, `FB_PAGE_ID_${lang}=${page.id}`, `META_PAGE_ACCESS_TOKEN_${lang}=${page.access_token}`);
  writeFileSync(file, `${keep.join("\n")}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);

  console.error(`\nsaved to ${file} (owner-only):`);
  console.error(`  Page:      ${page.name} (${page.id})`);
  console.error(`  Instagram: @${page.instagram_business_account.username} (${page.instagram_business_account.id})`);
  console.error(`  keys:      IG_USER_ID_${lang}, FB_PAGE_ID_${lang}, META_PAGE_ACCESS_TOKEN_${lang}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
