import { test } from "node:test";
import assert from "node:assert/strict";
import type { Assessment, Claim, SourceRecord } from "@openlens/schemas";
import { citationCoverage, passageInSource, validateAssessment, validateClaims } from "./validators.js";

const src: SourceRecord = {
  id: "s1", storyId: "t", url: "https://example.com/a", publisher: "P", title: "T",
  publishedAt: "2026-01-01", language: "en", sourceType: "reporting",
  lens: { rating: "center" }, rights: { license: "x", usage: "y" },
  text: "Fares will rise by 20 percent\nfrom 1 January.",
};
const claim: Claim = {
  id: "c1", storyId: "t", text: "Fares rise 20% from 1 Jan", claimType: "fact", state: "unverified",
  evidence: [{ sourceId: "s1", passage: "fares will rise by 20 percent from 1 january" }],
  independentSourceCount: 1, version: 1,
};

test("passage match ignores case and whitespace", () => {
  assert.ok(passageInSource("FARES will rise by 20 percent from 1 January", src));
  assert.ok(!passageInSource("fares will fall", src));
});

test("validateClaims flags fabricated passages and unknown sources", () => {
  assert.deepEqual(validateClaims([claim], [src]), []);
  const bad: Claim = { ...claim, evidence: [{ sourceId: "s1", passage: "made up" }, { sourceId: "zz", passage: "x" }] };
  const kinds = validateClaims([bad], [src]).map((v) => v.kind);
  assert.deepEqual(kinds, ["passage_not_found", "missing_source"]);
});

test("assessment citations must reference existing claims", () => {
  const a: Assessment = {
    storyId: "t", ledgerVersion: 1, headline: "h", neutralSummary: "s",
    sections: [
      { kind: "established", text: "x", claimIds: ["c1"] },
      { kind: "unknown", text: "y", claimIds: ["c9"] },
    ],
  };
  assert.deepEqual(
    validateAssessment(a, [claim]).map((v) => v.kind),
    ["unsupported_established", "unknown_claim_id"],
  );
  assert.equal(citationCoverage(a, [claim]), 0.5);
});

test("established sections accept supported claims", () => {
  const a: Assessment = {
    storyId: "t", ledgerVersion: 1, headline: "h", neutralSummary: "s",
    sections: [{ kind: "established", text: "x", claimIds: ["c1"] }],
  };
  assert.deepEqual(validateAssessment(a, [{ ...claim, state: "supported" }]), []);
});
