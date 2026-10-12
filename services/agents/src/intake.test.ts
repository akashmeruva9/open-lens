import { test } from "node:test";
import assert from "node:assert/strict";
import { intakeUrl, normalizeLang, type AllowlistEntry } from "./intake.js";

const allow: AllowlistEntry[] = [{
  domain: "example.go.jp", publisher: "Example Ministry", market: "JP", sourceType: "primary",
  lens: { rating: "unrated", ratingBasis: "primary document" }, rights: { license: "open-government", usage: "attribution" },
}];
const page = `<!doctype html><html lang="ja"><head><title>運賃改定のお知らせ</title>
<meta property="article:published_time" content="2026-10-01T09:00:00+09:00"></head><body><nav>menu</nav>
<article><h1>運賃改定のお知らせ</h1><p>${"当局は来年一月一日から運賃を二十パーセント改定すると発表しました。".repeat(8)}</p></article></body></html>`;
const fakeFetch = (async () => new Response(page, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;

test("rejects domains not on the allowlist", async () => {
  const r = await intakeUrl("https://news.example.com/a", "s", "s1", allow, fakeFetch);
  assert.match(r.rejected ?? "", /not in data\/sources\/allowlist/);
});

test("extracts an allowlisted Japanese article with rights and rating from the allowlist", async () => {
  const r = await intakeUrl("https://www.example.go.jp/press/1", "story", "s1", allow, fakeFetch);
  assert.ok(r.source, r.rejected ?? "no source");
  assert.equal(r.source!.language, "ja");
  assert.equal(r.source!.sourceType, "primary");
  assert.equal(r.source!.publishedAt, "2026-10-01T00:00:00.000Z");
  assert.match(r.source!.text, /二十パーセント/);
  assert.doesNotMatch(r.source!.text, /menu/);
});

test("language normalisation", () => {
  assert.equal(normalizeLang("zh-TW", ""), "zh-Hant");
  assert.equal(normalizeLang(null, "ข่าว"), "th");
  assert.equal(normalizeLang("tl", ""), "fil");
});
