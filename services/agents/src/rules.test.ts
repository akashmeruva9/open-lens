import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claim, SourceRecord } from "@openlens/schemas";
import { assignStates } from "./corroborate.js";
import { unknownNumbers } from "./qa.js";
import { xLength } from "./channels.js";

const src = (id: string, extra: Partial<SourceRecord> = {}): SourceRecord => ({
  id, storyId: "t", url: `https://example.com/${id}`, publisher: id, title: id, publishedAt: "2026-01-01",
  language: "en", sourceType: "reporting", lens: { rating: "center" }, rights: { license: "x", usage: "y" }, text: "", ...extra,
});
const claim = (id: string, sourceId: string, extra: Partial<Claim> = {}): Claim => ({
  id, storyId: "t", text: id, claimType: "fact", state: "unverified",
  evidence: [{ sourceId, passage: id }], independentSourceCount: 1, version: 1, ...extra,
});

test("two independent sources -> supported; single source -> unverified", () => {
  const out = assignStates([claim("a", "s1"), claim("b", "s2"), claim("c", "s1")], [src("s1"), src("s2")],
    [{ claimIds: ["a", "b"], contradictedBy: [], note: "" }, { claimIds: ["c"], contradictedBy: [], note: "" }]);
  assert.equal(out[0]!.state, "supported");
  assert.equal(out[0]!.evidence.length, 2);
  assert.equal(out[2]!.state, "unverified");
});

test("syndicated copies of one press release are not independent", () => {
  const out = assignStates([claim("a", "s1"), claim("b", "s2")], [src("s1"), src("s2", { derivedFrom: "s1" })],
    [{ claimIds: ["a", "b"], contradictedBy: [], note: "" }]);
  assert.equal(out[0]!.state, "unverified");
  assert.equal(out[0]!.independentSourceCount, 1);
});

test("primary source supports; contradiction contests; opinions stay attributed", () => {
  const out = assignStates(
    [claim("a", "p"), claim("b", "s1"), claim("c", "s2"), claim("d", "s1", { claimType: "opinion", attributedTo: "X" })],
    [src("p", { sourceType: "primary" }), src("s1"), src("s2")],
    [
      { claimIds: ["a"], contradictedBy: [], note: "" },
      { claimIds: ["b"], contradictedBy: ["c"], note: "" },
      { claimIds: ["c"], contradictedBy: ["b"], note: "" },
      { claimIds: ["d"], contradictedBy: [], note: "" },
    ]);
  assert.deepEqual(out.map((c) => c.state), ["supported", "contested", "contested", "attributed"]);
});

test("unknownNumbers flags numbers absent from the ledger", () => {
  assert.deepEqual(unknownNumbers("Fares rise 20% after a 7-2 vote, costing 1,200", ["rise by 20 percent", "7-2 vote"]), ["1200"]);
});

test("xLength counts URLs as 23 characters", () => {
  assert.equal(xLength(`hi https://openlens.app/story/${"x".repeat(80)}`), 3 + 23);
});
