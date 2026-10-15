import { test } from "node:test";
import assert from "node:assert/strict";
import { clearRobotsCache, isAllowed, parseRobots, robotsAllows } from "./robots.js";

const TXT = `User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /search
Disallow: /*?share=
Allow: /search/about
Disallow: /private$

User-agent: Googlebot
Disallow: /news/`;

test("uses the * group when no OpenLensBot group exists; AI-crawler groups don't apply", () => {
  const rules = parseRobots(TXT);
  assert.equal(isAllowed(rules, "/world/2026/10/15/story"), true);
  assert.equal(isAllowed(rules, "/news/story"), true);
  assert.equal(isAllowed(rules, "/search?q=x"), false);
  assert.equal(isAllowed(rules, "/search/about"), true);
  assert.equal(isAllowed(rules, "/a?share=1"), false);
  assert.equal(isAllowed(rules, "/private"), false);
  assert.equal(isAllowed(rules, "/private/ok"), true);
});

test("an OpenLensBot group takes precedence over *", () => {
  const rules = parseRobots(`User-agent: *\nAllow: /\n\nUser-agent: OpenLensBot\nDisallow: /`);
  assert.equal(isAllowed(rules, "/anything"), false);
});

test("fetch outcomes: 404 robots = allowed, 5xx = not this time", async () => {
  clearRobotsCache();
  const f404 = (async () => new Response("", { status: 404 })) as typeof fetch;
  assert.equal(await robotsAllows("https://a.example/x", f404), true);
  const f503 = (async () => new Response("", { status: 503 })) as typeof fetch;
  assert.equal(await robotsAllows("https://b.example/x", f503), false);
  const fBlock = (async () => new Response("User-agent: *\nDisallow: /", { status: 200 })) as typeof fetch;
  assert.equal(await robotsAllows("https://c.example/x", fBlock), false);
});
