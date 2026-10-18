import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, isPrivateAddress, keepGroundedClaims, LinkError, pageText, safeFetchPage, summarize } from "./linkcheck.js";

const resolveTo = (...a: string[]) => async () => a;

test("isPrivateAddress refuses loopback, private, link-local, cloud metadata and mapped addresses", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1", "not-an-ip"]) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(isPrivateAddress(a), false, a);
});

test("assertPublicUrl: schemes, ports, logins, local names and private resolutions are refused", async () => {
  const pub = resolveTo("93.184.216.34");
  assert.equal((await assertPublicUrl("https://example.com/a", pub)).hostname, "example.com");
  for (const bad of ["ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.com/", "https://example.com:8443/", "http://localhost/", "http://foo.internal/", "http://169.254.169.254/", "http://[::1]/", "garbage"]) {
    await assert.rejects(assertPublicUrl(bad, pub), LinkError, bad);
  }
  await assert.rejects(assertPublicUrl("https://sneaky.example.com/", resolveTo("93.184.216.34", "10.0.0.7")), /not a public website/);
  await assert.rejects(assertPublicUrl("https://nxdomain.example.com/", async () => []), /could not find/);
});

const page = (body: string, headers: Record<string, string> = { "content-type": "text/html" }, status = 200) => new Response(body, { status, headers });
const as = (f: (u: string) => Response | Promise<Response>) => (async (u: string) => f(u)) as unknown as typeof fetch;

test("safeFetchPage: follows a redirect only to another public address, honours robots.txt, and limits type and size", async () => {
  const pub = resolveTo("93.184.216.34");
  const ok = await safeFetchPage("https://a.example/x", { resolve: pub, robots: async () => true, fetchImpl: as((u) => (u.includes("/x") ? new Response(null, { status: 302, headers: { location: "https://b.example/y" } }) : page("<p>hello</p>"))) });
  assert.equal(ok.finalUrl, "https://b.example/y");
  await assert.rejects(safeFetchPage("https://a.example/x", { resolve: async (h) => (h === "a.example" ? ["93.184.216.34"] : ["10.0.0.9"]), robots: async () => true, fetchImpl: as(() => new Response(null, { status: 302, headers: { location: "https://evil.example/" } })) }), /not a public website/);
  await assert.rejects(safeFetchPage("https://a.example/x", { resolve: pub, robots: async () => false, fetchImpl: as(() => page("x")) }), /not to open its pages/);
  await assert.rejects(safeFetchPage("https://a.example/x", { resolve: pub, robots: async () => true, fetchImpl: as(() => page("%PDF", { "content-type": "application/pdf" })) }), /not a web page/);
  await assert.rejects(safeFetchPage("https://a.example/x", { resolve: pub, robots: async () => true, fetchImpl: as(() => page("x".repeat(1_600_000))) }), /too large/);
  await assert.rejects(safeFetchPage("https://a.example/x", { resolve: pub, robots: async () => true, fetchImpl: as(() => page("no", {}, 404)) }), /error \(404\)/);
});

test("pageText takes the title and the main paragraphs, drops scripts, menus and short fragments, and decodes entities", () => {
  const html = `<html><head><title>Fallback title</title><meta property="og:title" content="The real &amp; headline"></head><body><nav><p>Home menu item that should vanish entirely from the page text here</p></nav><script>var x = "ignore me ignore me ignore me ignore me ignore me";</script><article><p>Short.</p><p>The Authority said fares will rise &mdash; by 20&nbsp;percent &quot;from January&quot; after the vote on Tuesday.</p></article><footer><p>Copyright footer text that should also not appear in the extracted article text</p></footer></body></html>`;
  const { title, text } = pageText(html);
  assert.equal(title, "The real & headline");
  assert.match(text, /fares will rise — by 20 percent "from January"/);
  assert.ok(!/menu|ignore me|Copyright|Short\./.test(text));
});

test("keepGroundedClaims drops claims that are not backed by the page, duplicates, and badly sized ones", () => {
  const text = "The Metro Authority said fares will rise by 20 percent from January. Chairperson Anil Rao said the increase covers electricity costs.";
  const kept = keepGroundedClaims(["Metro fares will rise by 20 percent from January.", "metro fares will rise by 20 percent from january.", "Aliens landed in the city centre on Monday and met the mayor.", "Too short.", "Chairperson Anil Rao said the increase covers electricity costs."], text);
  assert.deepEqual(kept, ["Metro fares will rise by 20 percent from January.", "Chairperson Anil Rao said the increase covers electricity costs."]);
  assert.ok(keepGroundedClaims(Array.from({ length: 10 }, (_, i) => `Metro fares will rise by 20 percent from January, point ${i}.`), text, 3).length <= 3);
});

test("summarize says plainly how much was covered", () => {
  assert.match(summarize([]).headline, /could not find checkable claims/);
  assert.match(summarize([{ status: "not_covered" }, { status: "not_covered" }]).headline, /None of the 2 claims/);
  assert.match(summarize([{ status: "supported" }, { status: "contradicted" }, { status: "not_covered" }]).headline, /2 of 3 claims relate to our stories, and 1 is contradicted or disputed/);
});
