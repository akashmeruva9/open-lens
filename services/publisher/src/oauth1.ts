import { createHmac, randomBytes } from "node:crypto";

/** RFC 3986 percent-encoding as required by OAuth 1.0a. */
export function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface OAuth1Params {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  /** Extra form-encoded body params to sign (NOT for JSON or multipart bodies). */
  bodyParams?: Record<string, string>;
  nonce?: string;
  timestamp?: string;
}

/** Build an OAuth 1.0a HMAC-SHA1 Authorization header (user context). Query params are signed. */
export function oauth1Header(p: OAuth1Params): string {
  const u = new URL(p.url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: p.consumerKey,
    oauth_nonce: p.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: p.timestamp ?? Math.floor(Date.now() / 1000).toString(),
    oauth_token: p.token,
    oauth_version: "1.0",
  };
  const pairs: [string, string][] = [];
  for (const [k, v] of u.searchParams) pairs.push([pct(k), pct(v)]);
  for (const [k, v] of Object.entries(p.bodyParams ?? {})) pairs.push([pct(k), pct(v)]);
  for (const [k, v] of Object.entries(oauth)) pairs.push([pct(k), pct(v)]);
  pairs.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  const paramString = pairs.map(([k, v]) => `${k}=${v}`).join("&");
  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
  const base = [p.method.toUpperCase(), pct(baseUrl), pct(paramString)].join("&");
  const key = `${pct(p.consumerSecret)}&${pct(p.tokenSecret)}`;
  const signature = createHmac("sha1", key).update(base).digest("base64");
  const header = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.entries(header)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
      .join(", ")
  );
}
